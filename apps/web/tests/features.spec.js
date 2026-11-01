import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {login,createSection,startCreate} from './ui-helpers.js';
const require=createRequire(import.meta.url);
const sharp=require('../../api/node_modules/sharp');
test('GPAX profile, comparison, repeat rejection and Thai template work through the real API',async({page},info)=>{
  await login(page,'browser-gpax-'+info.project.name);await createSection(page);
  await page.getByRole('navigation').getByRole('button',{name:'รายวิชา',exact:true}).click();
  await page.getByRole('button',{name:'เปรียบเทียบ GPAX',exact:true}).click();
  await page.getByLabel('GPA สะสม',{exact:true}).fill('3');await page.getByLabel('หน่วยกิตที่นับใน GPA',{exact:true}).fill('30');
  await page.getByRole('button',{name:'บันทึกผลการเรียนสะสม'}).click();await expect(page.getByText('บันทึกข้อมูลผลการเรียนสะสมแล้ว')).toBeVisible();
  await page.getByRole('combobox',{name:'ผลการเรียนสมมติ',exact:true}).selectOption('A');await page.getByRole('button',{name:'เปรียบเทียบเรียนต่อกับถอนรายวิชา'}).click();
  await expect(page.getByText('GPAX 3.09',{exact:true})).toBeVisible();await expect(page.getByText('GPAX 3',{exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'ส่วนต่าง GPAX'})).toHaveText('ส่วนต่าง GPAX (ถอนลบเรียนต่อ): -0.09');
  await expect(page.getByRole('figure',{name:'กราฟเปรียบเทียบ GPAX'}).locator('.recharts-bar')).toBeVisible();
  await expect(page.getByRole('heading',{name:'สิ่งที่ควรพิจารณาก่อนถอนรายวิชา'})).toBeVisible();
  await page.getByRole('button',{name:'ดูคำอธิบายภาษาไทย'}).click();await expect(page.getByText('แม่แบบภายในระบบ',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'แต้มเกรดเดิมของรายวิชาที่เรียนซ้ำ',exact:true}).selectOption('0');await page.getByRole('button',{name:'บันทึกข้อมูลเรียนซ้ำ'}).click();
  await expect(page.getByText(/บันทึกข้อมูลเรียนซ้ำแล้ว/)).toBeVisible();await page.getByRole('button',{name:'เปรียบเทียบเรียนต่อกับถอนรายวิชา'}).click();
  await expect(page.getByRole('alert')).toContainText('ยังไม่ยืนยันกฎการเรียนซ้ำ');
  await page.screenshot({path:info.outputPath('gpax-repeat-boundary.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('PNG syllabus is reviewed and confirmed without writing until final section creation',async({page},info)=>{
  await login(page,'browser-ocr-'+info.project.name);await startCreate(page);await page.getByRole('button',{name:'ดำเนินการต่อ',exact:true}).click();
  const image=await sharp({create:{width:50,height:50,channels:3,background:'white'}}).png().toBuffer();
  await page.getByLabel('ภาพประมวลรายวิชา',{exact:true}).setInputFiles({name:'syllabus.png',mimeType:'image/png',buffer:image});
  await expect(page.getByText('ผลรวมน้ำหนักที่อ่านได้: 100%',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'ใช้ข้อมูลที่ตรวจสอบแล้ว'})).toBeDisabled();
  const count=await page.evaluate(async token=>{
    const result=await fetch('/api/v1/enrollments',{headers:{Authorization:'Bearer '+token}});
    return (await result.json()).data.items.length;
  },'browser-ocr-'+info.project.name);expect(count).toBe(0);
  await page.getByRole('checkbox',{name:'ฉันตรวจสอบค่าที่อ่านได้ทุกรายการกับประมวลรายวิชาแล้ว'}).check();
  await page.getByRole('button',{name:'ใช้ข้อมูลที่ตรวจสอบแล้ว'}).click();await expect(page.getByText('ผลรวมน้ำหนักที่อ่านได้: 100%')).toHaveCount(0);
  await page.getByRole('button',{name:'ดำเนินการต่อ',exact:true}).click();await page.getByRole('button',{name:'สร้างกลุ่มเรียน',exact:true}).click();
  await page.getByRole('button',{name:'ไปที่รายวิชา'}).click();await expect(page.getByRole('heading',{name:'รายการประเมิน',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('ocr-confirmed-course.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('PDF uploads are refused and external consent can be toggled without losing storage',async({page},info)=>{
  await login(page,'browser-feature-consent-'+info.project.name);await startCreate(page);await page.getByRole('button',{name:'ดำเนินการต่อ',exact:true}).click();
  await page.getByLabel('ภาพประมวลรายวิชา',{exact:true}).setInputFiles({name:'syllabus.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});
  await expect(page.getByRole('alert')).toContainText('ไม่รองรับ PDF');
  await page.getByRole('navigation').getByRole('button',{name:'ความเป็นส่วนตัว',exact:true}).click();
  const choice=page.getByRole('checkbox',{name:'ฉันยินยอมให้ส่งค่าที่คำนวณแล้วไปประมวลผลภายนอกเพื่อสร้างคำอธิบาย'});
  await expect(choice).not.toBeChecked();await choice.check();await expect(choice).toBeChecked();await expect(choice).toBeEnabled();
  await choice.uncheck();await expect(choice).not.toBeChecked();await expect(page.getByText('คุณยินยอมให้จัดเก็บข้อมูลแล้ว',{exact:true})).toBeVisible();
});
