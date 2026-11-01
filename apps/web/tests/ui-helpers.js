import { expect } from '@playwright/test';
export const login=async(page,token)=>{
  await page.route('**/src/line-client.js',route=>route.fulfill({contentType:'application/javascript',body:'export default {init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> '+JSON.stringify(token)+'};'}));
  await page.goto('/');
  await page.getByRole('checkbox',{name:/ฉันยินยอม/}).check();
  await page.getByRole('button',{name:'ยินยอมและดำเนินการต่อ'}).click();
  await page.getByRole('button',{name:'ใช้ต่อโดยไม่ใช้ AI',exact:true}).click();
  await expect(page.getByRole('heading',{name:'รายวิชาของฉัน',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'รีเฟรชรายวิชา'})).toBeEnabled();
};
export const startCreate=async page=>{
  await page.getByRole('navigation').getByRole('button',{name:'เพิ่มรายวิชา',exact:true}).click();
  await page.getByRole('button',{name:/สร้างกลุ่มเรียน/}).click();
};
export const createSection=async page=>{
  await startCreate(page);
  await page.getByRole('button',{name:'ดำเนินการต่อ',exact:true}).click();
  await page.getByRole('button',{name:'ดำเนินการต่อ',exact:true}).click();
  await page.getByRole('button',{name:'สร้างกลุ่มเรียน',exact:true}).click();
  await page.getByRole('button',{name:'ไปที่รายวิชา'}).click();
};
export const expectPoints=async(page,value)=>expect(page.locator('.progress-card .points')).toHaveText(value+' / 100');
export const recordScore=async(page,name,value)=>{
  await page.getByRole('button',{name:new RegExp('^'+name+' .*น้ำหนัก')}).click();
  await page.getByLabel(name+' คะแนน',{exact:true}).fill(String(value));
  await page.getByRole('button',{name:'บันทึก '+name,exact:true}).click();
};
