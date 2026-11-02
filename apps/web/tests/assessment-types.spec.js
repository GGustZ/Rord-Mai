import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { login, startCreate, createSection, expectPoints } from './ui-helpers.js';
const { Pool } = createRequire(import.meta.url)('../../api/node_modules/pg');

const fit = async (page, info, name) => {
  for (const width of info.project.name === 'phone' ? [320,360,390] : [1280]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true});
};

test('marks and attendance forms stay separate when changing assessment selection', async ({page}, info) => {
  await login(page,'browser-types-'+info.project.name);
  await startCreate(page); await page.getByLabel('Example structure').selectOption('mixed');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Input Type',exact:true}).nth(0)).toHaveValue('attendance');
  await expect(page.getByRole('combobox',{name:'Input Type',exact:true}).nth(1)).toHaveValue('marks');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Create Section',exact:true}).click();
  await page.getByRole('button',{name:'Go to Course'}).click();
  await page.getByRole('button',{name:/^Assignments .*Weight/}).click();
  await expect(page.getByLabel('Assignments Score',{exact:true})).toHaveAttribute('max','50');
  await expect(page.getByLabel('Attended Sessions',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Raw marks',exact:true})).toHaveCount(0);
  await page.getByLabel('Assignments Score',{exact:true}).fill('45');
  await fit(page,info,'assignment-marks-only');
  await page.getByRole('button',{name:'Attendance',exact:true}).click();
  await expect(page.getByRole('option',{name:'Assignments',exact:true})).toHaveCount(0);
  const attendanceId = await page.getByRole('option',{name:'Attendance',exact:true}).getAttribute('value');
  await page.getByRole('combobox',{name:'Assessment Component',exact:true}).selectOption(attendanceId);
  await expect(page.getByLabel('Attended Sessions',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Attendance Score',{exact:true})).toHaveCount(0);
  await expect(page.getByText(/Maximum .* marks/)).toHaveCount(0);
  await page.getByLabel('Attended Sessions',{exact:true}).fill('11');
  await page.getByLabel('Total Sessions',{exact:true}).fill('10');
  await expect(page.getByRole('button',{name:'Save Attendance',exact:true})).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveText('Attended sessions cannot exceed total sessions');
  await page.getByLabel('Attended Sessions',{exact:true}).fill('8');
  await fit(page,info,'attendance-sessions-only');
  await page.getByRole('button',{name:'Score',exact:true}).click();
  const finalId = await page.getByRole('option',{name:'Final',exact:true}).getAttribute('value');
  await page.getByRole('combobox',{name:'Assessment Component',exact:true}).selectOption(finalId);
  await expect(page.getByLabel('Final Score',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Attended Sessions',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Attendance',exact:true}).click();
  await page.getByRole('combobox',{name:'Assessment Component',exact:true}).selectOption(attendanceId);
  await expect(page.getByLabel('Attended Sessions',{exact:true})).toHaveValue('');
  await page.getByLabel('Attended Sessions',{exact:true}).fill('8');
  await page.getByLabel('Total Sessions',{exact:true}).fill('10');
  await page.getByRole('button',{name:'Save Attendance',exact:true}).click();
  await expectPoints(page,8);
  await expect(page.getByText('Attendance: 8/10 (80%)')).toBeVisible();
});

test('creator classifies legacy assessments, preserving incompatible entries until manual correction', async ({page,context},info) => {
  const token='browser-legacy-types-'+info.project.name;
  await login(page,token); await createSection(page);
  const headers={Authorization:'Bearer '+token};
  const list=await (await page.request.get('/api/v1/enrollments',{headers})).json();
  const enrollment=list.data.items[0];
  const detail=await (await page.request.get('/api/v1/enrollments/'+enrollment.id,{headers})).json();
  const section=detail.data.section;
  const url=process.env.TEST_DATABASE_URL;
  if(!url||!/\/rordmai_test(?:\?|$)/.test(url))throw Error('Use disposable rordmai_test.');
  const pool=new Pool({connectionString:url});
  try {
    // These writes simulate pre-migration data in this test's newly created section only.
    await pool.query('UPDATE components SET input_type=NULL WHERE section_id=$1',[section.id]);
    await pool.query('INSERT INTO attendance(enrollment_id,component_id,section_id,attended,total_sessions) VALUES ($1,$2,$3,8,10)',[enrollment.id,section.components[0].id,section.id]);
    await pool.query('INSERT INTO scores(enrollment_id,component_id,section_id,score) VALUES ($1,$2,$3,50)',[enrollment.id,section.components[1].id,section.id]);
  } finally {await pool.end();}
  await page.getByRole('button',{name:'Refresh course and weights'}).click();await expectPoints(page,62);
  const friend=await context.newPage(); await login(friend,'browser-legacy-friend-'+info.project.name);
  await friend.getByRole('navigation').getByRole('button',{name:'Add a Course',exact:true}).click();
  await friend.getByRole('button',{name:/Join Existing Section/}).click();
  await friend.getByLabel('6-character Join Code').fill(section.joinCode);
  await friend.getByRole('button',{name:'Join Section',exact:true}).click();await friend.getByRole('button',{name:'Confirm & Join Section'}).click();
  await friend.getByRole('button',{name:'Go to Course'}).click();
  await expect(friend.getByText(/The creator must confirm assessment types/)).toBeVisible();
  await expect(friend.getByRole('button',{name:'Confirm assessment types'})).toHaveCount(0);
  await page.getByRole('button',{name:/^Midterm .*Weight/}).click();
  await expect(page.getByRole('button',{name:'Save Midterm',exact:true})).toBeDisabled();
  await expect(page.getByText('Recorded entry: 8 / 10 sessions')).toBeVisible();
  await page.getByRole('button',{name:'Confirm assessment types'}).click();
  await page.getByLabel('Midterm Input Type').selectOption('marks');
  await page.getByRole('checkbox',{name:/I have checked the weights and assessment types/}).check();
  await expect(page.getByRole('button',{name:'Save shared structure'})).toBeDisabled();
  await page.getByLabel('Final Input Type').selectOption('attendance');
  await expect(page.getByRole('checkbox',{name:/I have checked the weights and assessment types/})).not.toBeChecked();
  await page.getByRole('checkbox',{name:/I have checked the weights and assessment types/}).check();
  await fit(page,info,'legacy-classification');
  await page.getByRole('button',{name:'Save shared structure'}).click();await expectPoints(page,62);
  await page.getByRole('button',{name:/^Midterm .*Weight/}).click();
  await expect(page.getByLabel('Midterm Score',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('Attended Sessions',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('incompatible existing entry');
  await fit(page,info,'legacy-attendance-correction');
  await page.getByRole('button',{name:'Remove entry Midterm'}).click();
  await expect(page.getByLabel('Midterm Score',{exact:true})).toBeEnabled();
  await page.getByLabel('Midterm Score',{exact:true}).fill('80');
  await page.getByRole('button',{name:'Save Midterm',exact:true}).click();await expectPoints(page,62);
  await page.getByRole('button',{name:/^Final .*Weight/}).click();
  await expect(page.getByLabel('Attended Sessions',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('Final Score',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('incompatible existing entry');
  await page.getByRole('button',{name:'Remove entry Final'}).click();
  await page.getByLabel('Attended Sessions',{exact:true}).fill('5');
  await page.getByLabel('Total Sessions',{exact:true}).fill('10');
  await page.getByRole('button',{name:'Save Final',exact:true}).click();await expectPoints(page,62);
  await friend.getByRole('button',{name:'Refresh course and weights'}).click();
  await expect(friend.getByText(/The creator must confirm assessment types/)).toHaveCount(0);
  await friend.close();
});
