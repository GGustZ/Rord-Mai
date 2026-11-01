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
      label.textContent='การสาธิตภายในเครื่อง · ข้อมูลสมมติ | '+text;
    },text);
    await page.waitForTimeout(2000);
  };
  await caption('ยินยอมจัดเก็บข้อมูล แยกจากคำอธิบายด้วย AI ซึ่งเลือกไม่ใช้ได้');
  await createSection(page);await expectPoints(page,0);
  await caption('สร้างกลุ่มเรียนด้วยตนเอง: สอบกลางภาค 40% และปลายภาค 60%');
  await recordScore(page,'Midterm',80);await expectPoints(page,32);
  await caption('80 จาก 100 ในส่วนที่หนัก 40% ให้คะแนนถ่วงน้ำหนัก 32 จุด');
  await page.getByRole('button',{name:/เกรดเป้าหมาย A/}).click();
  await page.getByRole('button',{name:'บันทึกเป้าหมายและคำนวณ'}).click();
  await expect(page.getByText(/คะแนนที่ต้องได้ในส่วนที่เหลือ:/)).toContainText('80%');
  await caption('เป้าหมาย A ที่ 80 จุด ต้องได้เฉลี่ย 80% ในส่วนที่เหลือ');
  await page.getByRole('navigation').getByRole('button',{name:'รายวิชา',exact:true}).click();
  await page.getByRole('button',{name:'เปรียบเทียบ GPAX',exact:true}).click();
  await page.getByLabel('GPA สะสม',{exact:true}).fill('3');
  await page.getByLabel('หน่วยกิตที่นับใน GPA',{exact:true}).fill('30');
  await page.getByRole('button',{name:'บันทึกผลการเรียนสะสม'}).click();
  await expect(page.getByText('บันทึกข้อมูลผลการเรียนสะสมแล้ว')).toBeVisible();
  await page.getByRole('combobox',{name:'ผลการเรียนสมมติ',exact:true}).selectOption('A');
  await page.getByRole('button',{name:'เปรียบเทียบเรียนต่อกับถอนรายวิชา'}).click();
  await expect(page.getByText('GPAX 3.09',{exact:true})).toBeVisible();
  await expect(page.getByText('GPAX 3',{exact:true})).toBeVisible();
  await caption('สมมติได้ A: เรียนต่อ GPAX 3.09 ถอนรายวิชา 3.00 ส่วนต่าง -0.09');
  await page.getByRole('figure',{name:'กราฟเปรียบเทียบ GPAX'}).scrollIntoViewIfNeeded();
  await caption('กราฟใช้ค่าจากเครื่องคำนวณ ผลเป็นประมาณการ ไม่ใช่คำแนะนำให้ถอน');
  await page.screenshot({path:info.outputPath('comparison.png'),fullPage:true});
  await page.getByRole('heading',{name:'สิ่งที่ควรพิจารณาก่อนถอนรายวิชา'}).scrollIntoViewIfNeeded();
  await caption('พิจารณาหน่วยกิต วิชาต่อเนื่อง การเปิดสอน และค่าใช้จ่ายร่วมด้วย');
  await page.getByRole('button',{name:'ดูคำอธิบายภาษาไทย'}).click();
  await expect(page.getByText('แม่แบบภายในระบบ',{exact:true})).toBeVisible();
  await page.getByText('แม่แบบภายในระบบ',{exact:true}).scrollIntoViewIfNeeded();
  await caption('ไม่ใช้ AI ก็ได้รับคำอธิบายภาษาไทยครบถ้วน');
  await page.getByRole('navigation').getByRole('button',{name:'ความเป็นส่วนตัว',exact:true}).click();
  await caption('เจ้าของข้อมูลเลือกถอนความยินยอมและลบข้อมูลได้เอง');
  await page.getByRole('checkbox',{name:/ฉันยืนยันการลบข้อมูล/}).check();
  await page.getByRole('button',{name:'ลบข้อมูลของฉัน',exact:true}).click();
  await expect(page.getByRole('button',{name:'ยินยอมและดำเนินการต่อ'})).toBeVisible();
  await caption('ลบข้อมูลส่วนตัวแล้ว การทดสอบกับ LINE จริงและผู้ใช้จริงยังรอหลักฐาน');
});
