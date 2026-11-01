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
  await startCreate(page); await page.getByLabel('เลือกโครงสร้างตัวอย่าง').selectOption('mixed');
  await page.getByRole('button',{name:'ดำเนินการต่อ',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'ประเภทข้อมูล',exact:true}).nth(0)).toHaveValue('attendance');
  await expect(page.getByRole('combobox',{name:'ประเภทข้อมูล',exact:true}).nth(1)).toHaveValue('marks');
  await page.getByRole('button',{name:'ดำเนินการต่อ',exact:true}).click();
  await page.getByRole('button',{name:'สร้างกลุ่มเรียน',exact:true}).click();
  await page.getByRole('button',{name:'ไปที่รายวิชา'}).click();
  await page.getByRole('button',{name:/^Assignments .*น้ำหนัก/}).click();
  await expect(page.getByLabel('Assignments คะแนน',{exact:true})).toHaveAttribute('max','50');
  await expect(page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Raw marks',exact:true})).toHaveCount(0);
  await page.getByLabel('Assignments คะแนน',{exact:true}).fill('45');
  await fit(page,info,'assignment-marks-only');
  const attendanceId = await page.getByRole('option',{name:'การเข้าเรียน',exact:true}).getAttribute('value');
  await page.getByRole('combobox',{name:'รายการประเมิน',exact:true}).selectOption(attendanceId);
  await expect(page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('การเข้าเรียน คะแนน',{exact:true})).toHaveCount(0);
  await expect(page.getByText(/Maximum .* marks/)).toHaveCount(0);
  await page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true}).fill('11');
  await page.getByLabel('จำนวนครั้งทั้งหมด',{exact:true}).fill('10');
  await expect(page.getByRole('button',{name:'บันทึก การเข้าเรียน',exact:true})).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveText('จำนวนครั้งที่เข้าเรียนต้องไม่เกินจำนวนครั้งทั้งหมด');
  await page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true}).fill('8');
  await fit(page,info,'attendance-sessions-only');
  const finalId = await page.getByRole('option',{name:'Final',exact:true}).getAttribute('value');
  await page.getByRole('combobox',{name:'รายการประเมิน',exact:true}).selectOption(finalId);
  await expect(page.getByLabel('Final คะแนน',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true})).toHaveCount(0);
  await page.getByRole('combobox',{name:'รายการประเมิน',exact:true}).selectOption(attendanceId);
  await expect(page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true})).toHaveValue('');
  await page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true}).fill('8');
  await page.getByLabel('จำนวนครั้งทั้งหมด',{exact:true}).fill('10');
  await page.getByRole('button',{name:'บันทึก การเข้าเรียน',exact:true}).click();
  await expectPoints(page,8);
  await expect(page.getByText('การเข้าเรียน: 8/10 (80%)')).toBeVisible();
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
  await page.getByRole('button',{name:'รีเฟรชรายวิชาและน้ำหนัก'}).click();await expectPoints(page,62);
  const friend=await context.newPage(); await login(friend,'browser-legacy-friend-'+info.project.name);
  await friend.getByRole('navigation').getByRole('button',{name:'เพิ่มรายวิชา',exact:true}).click();
  await friend.getByRole('button',{name:/เข้าร่วมกลุ่มเรียน/}).click();
  await friend.getByLabel('รหัสเข้าร่วมกลุ่มเรียน').fill(section.joinCode);
  await friend.getByRole('button',{name:'เข้าร่วมกลุ่มเรียน',exact:true}).click();
  await friend.getByRole('button',{name:'ไปที่รายวิชา'}).click();
  await expect(friend.getByText(/ผู้สร้างกลุ่มเรียนต้องยืนยันประเภทรายการประเมิน/)).toBeVisible();
  await expect(friend.getByRole('button',{name:'ยืนยันประเภทรายการประเมิน'})).toHaveCount(0);
  await page.getByRole('button',{name:/^Midterm .*น้ำหนัก/}).click();
  await expect(page.getByRole('button',{name:'บันทึก Midterm',exact:true})).toBeDisabled();
  await expect(page.getByText('รายการที่บันทึก: 8 / 10 ครั้ง')).toBeVisible();
  await page.getByRole('button',{name:'ยืนยันประเภทรายการประเมิน'}).click();
  await page.getByLabel('Midterm ประเภทข้อมูล').selectOption('marks');
  await page.getByRole('checkbox',{name:/ฉันตรวจสอบน้ำหนักและประเภทรายการ/}).check();
  await expect(page.getByRole('button',{name:'บันทึกโครงสร้างร่วม'})).toBeDisabled();
  await page.getByLabel('Final ประเภทข้อมูล').selectOption('attendance');
  await expect(page.getByRole('checkbox',{name:/ฉันตรวจสอบน้ำหนักและประเภทรายการ/})).not.toBeChecked();
  await page.getByRole('checkbox',{name:/ฉันตรวจสอบน้ำหนักและประเภทรายการ/}).check();
  await fit(page,info,'legacy-classification');
  await page.getByRole('button',{name:'บันทึกโครงสร้างร่วม'}).click();await expectPoints(page,62);
  await page.getByRole('button',{name:/^Midterm .*น้ำหนัก/}).click();
  await expect(page.getByLabel('Midterm คะแนน',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('ข้อมูลเดิมที่ไม่ตรงกับประเภท');
  await fit(page,info,'legacy-attendance-correction');
  await page.getByRole('button',{name:'ล้างรายการ Midterm'}).click();
  await expect(page.getByLabel('Midterm คะแนน',{exact:true})).toBeEnabled();
  await page.getByLabel('Midterm คะแนน',{exact:true}).fill('80');
  await page.getByRole('button',{name:'บันทึก Midterm',exact:true}).click();await expectPoints(page,62);
  await page.getByRole('button',{name:/^Final .*น้ำหนัก/}).click();
  await expect(page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('Final คะแนน',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('ข้อมูลเดิมที่ไม่ตรงกับประเภท');
  await page.getByRole('button',{name:'ล้างรายการ Final'}).click();
  await page.getByLabel('จำนวนครั้งที่เข้าเรียน',{exact:true}).fill('5');
  await page.getByLabel('จำนวนครั้งทั้งหมด',{exact:true}).fill('10');
  await page.getByRole('button',{name:'บันทึก Final',exact:true}).click();await expectPoints(page,62);
  await friend.getByRole('button',{name:'รีเฟรชรายวิชาและน้ำหนัก'}).click();
  await expect(friend.getByText(/ผู้สร้างกลุ่มเรียนต้องยืนยันประเภทรายการประเมิน/)).toHaveCount(0);
  await friend.close();
});
