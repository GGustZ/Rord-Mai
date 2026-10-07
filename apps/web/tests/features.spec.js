import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {login,createSection,startCreate} from './ui-helpers.js';
const require=createRequire(import.meta.url);
const sharp=require('../../api/node_modules/sharp');
test('GPAX profile, comparison, repeat rejection and Thai template work through the real API',async({page},info)=>{
  await login(page,'browser-gpax-'+info.project.name);await createSection(page);
  await page.getByRole('navigation').getByRole('button',{name:'Courses',exact:true}).click();
  await page.getByRole('button',{name:'GPAX comparison',exact:true}).click();
  await page.getByLabel('Cumulative GPA',{exact:true}).fill('3');await page.getByLabel('Credits counted in GPA',{exact:true}).fill('30');
  await page.getByRole('button',{name:'Save cumulative profile'}).click();await expect(page.getByText('Cumulative profile saved.')).toBeVisible();
  await page.getByRole('combobox',{name:'Assumed outcome',exact:true}).selectOption('A');await page.getByRole('button',{name:'Compare stay and withdraw'}).click();
  await expect(page.getByText('GPAX 3.09',{exact:true})).toBeVisible();await expect(page.getByText('GPAX 3',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Explain in Thai'}).click();await expect(page.getByText('Local template',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Previous grade point for a repeated course',exact:true}).selectOption('0');await page.getByRole('button',{name:'Save repeat information'}).click();
  await expect(page.getByText(/Repeat metadata saved/)).toBeVisible();await page.getByRole('button',{name:'Compare stay and withdraw'}).click();
  await expect(page.getByRole('alert')).toContainText('official repeat-course rule');
  await page.screenshot({path:info.outputPath('gpax-repeat-boundary.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('PNG syllabus is reviewed and confirmed without writing until final section creation',async({page},info)=>{
  await login(page,'browser-ocr-'+info.project.name);await startCreate(page);await page.getByRole('button',{name:'Continue',exact:true}).click();
  const image=await sharp({create:{width:50,height:50,channels:3,background:'white'}}).png().toBuffer();
  await page.getByLabel('Syllabus image',{exact:true}).setInputFiles({name:'syllabus.png',mimeType:'image/png',buffer:image});
  await expect(page.getByText('Extracted weight total: 100%',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Use confirmed draft'})).toBeDisabled();
  const count=await page.evaluate(async token=>{
    const result=await fetch('/api/v1/enrollments',{headers:{Authorization:'Bearer '+token}});
    return (await result.json()).data.items.length;
  },'browser-ocr-'+info.project.name);expect(count).toBe(0);
  await page.getByRole('checkbox',{name:'I checked every extracted value against the syllabus.'}).check();
  await page.getByRole('button',{name:'Use confirmed draft'}).click();await expect(page.getByText('Extracted weight total: 100%')).toHaveCount(0);
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Create section',exact:true}).click();
  await page.getByRole('button',{name:'Go to course'}).click();await expect(page.getByRole('heading',{name:'Assessments',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('ocr-confirmed-course.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('PDF uploads are refused and external consent can be toggled without losing storage',async({page},info)=>{
  await login(page,'browser-feature-consent-'+info.project.name);await startCreate(page);await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Syllabus image',{exact:true}).setInputFiles({name:'syllabus.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});
  await expect(page.getByRole('alert')).toContainText('PDF is not supported');
  await page.getByRole('navigation').getByRole('button',{name:'Privacy',exact:true}).click();
  const choice=page.getByRole('checkbox',{name:'I allow external processing of calculated values for explanations.'});
  await expect(choice).not.toBeChecked();await choice.check();await expect(choice).toBeChecked();await expect(choice).toBeEnabled();
  await choice.uncheck();await expect(choice).not.toBeChecked();await expect(page.getByText('Storage consent is active.',{exact:true})).toBeVisible();
});
