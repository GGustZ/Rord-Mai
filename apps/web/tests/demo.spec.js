import {test,expect} from '@playwright/test';
import {login,createSection,recordScore,expectPoints} from './ui-helpers.js';

test('record local withdrawal-loop demo @demo',async({page},info)=>{
  test.skip(process.env.RECORD_DEMO!=='1','Explicit recording only; not participant UAT or deployed LINE acceptance.');
  test.setTimeout(110000);
  await login(page,'browser-recording-'+info.project.name);
  const caption=async text=>{
    await page.evaluate(text=>{
      let label=document.getElementById('demo-caption');
      if(!label){label=document.createElement('div');label.id='demo-caption';label.style.cssText='position:fixed;left:16px;right:16px;top:8px;padding:12px;background:#153e36;color:white;z-index:20;font:18px system-ui;border-radius:8px;pointer-events:none;';document.body.append(label);}
      label.textContent='Local demonstration · Fictional data | '+text;
    },text);
    await page.waitForTimeout(2000);
  };
  await caption('Separate storage permission and optional AI explanations');
  await createSection(page);await expectPoints(page,0);
  await caption('Create a fictional section with exam weights 40% and 60%');
  await recordScore(page,'Midterm',80);await expectPoints(page,32);
  await caption('80 out of 100 at 40% weight contributes 32 weighted points');
  await page.getByRole('button',{name:/Target Grade A/}).click();
  await page.getByRole('button',{name:'Save target and calculate'}).click();
  await expect(page.getByText(/Required remaining average:/)).toContainText('80%');
  await caption('Target A at 80 requires an 80% remaining average');
  await page.getByRole('navigation').getByRole('button',{name:'Courses',exact:true}).click();
  await page.getByRole('button',{name:'Compare GPAX',exact:true}).click();
  await page.getByLabel('Current Cumulative GPA (GPAX)',{exact:true}).fill('3');
  await page.getByLabel('GPA-counted Credits',{exact:true}).fill('30');
  await page.getByRole('button',{name:'Save academic profile'}).click();
  await expect(page.getByText('Academic profile saved')).toBeVisible();
  await page.getByRole('combobox',{name:'Assumed Outcome',exact:true}).selectOption('A');
  await page.getByRole('button',{name:'Compare staying and withdrawal'}).click();
  await expect(page.getByText('GPAX 3.09',{exact:true})).toBeVisible();
  await expect(page.getByText('GPAX 3',{exact:true})).toBeVisible();
  await caption('Assuming A: stay 3.09, withdraw 3.00, difference -0.09');
  await page.getByRole('figure',{name:'GPAX comparison chart'}).scrollIntoViewIfNeeded();
  await caption('Chart values come from the engine, not AI predictions');
  await page.screenshot({path:info.outputPath('comparison.png'),fullPage:true});
  await page.getByRole('heading',{name:'Before You Withdraw'}).scrollIntoViewIfNeeded();
  await caption('Consider credits, prerequisites, availability and costs');
  await page.getByRole('button',{name:'View Thai explanation'}).click();
  await expect(page.getByText('Internal template',{exact:true})).toBeVisible();
  await page.getByText('Internal template',{exact:true}).scrollIntoViewIfNeeded();
  await caption('Complete Thai template explanations work without external AI');
  await page.getByRole('navigation').getByRole('button',{name:'Help & Settings',exact:true}).click();
  await caption('Students can withdraw permission and delete their data');
  await page.getByRole('checkbox',{name:/I confirm deletion/}).check();
  await page.getByRole('button',{name:'Delete my data',exact:true}).click();
  await expect(page.getByRole('button',{name:'Agree & Continue'})).toBeVisible();
  await caption('Private data deleted. Live LINE and participant acceptance remain separate');
});
