import { expect } from '@playwright/test';
export const login=async(page,token)=>{
  await page.route('**/src/line-client.js',route=>route.fulfill({contentType:'application/javascript',body:'export default {init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> '+JSON.stringify(token)+'};'}));
  await page.goto('/');
  await page.getByRole('checkbox',{name:/Allow RordMai to store/}).check();
  await page.getByRole('button',{name:'Agree & Continue'}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Save profile & Continue'}).click();
  await page.getByRole('button',{name:'Go to My Courses',exact:true}).click();
  await expect(page.getByRole('heading',{name:'My Courses',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Refresh courses'})).toBeEnabled();
};
export const startCreate=async page=>{
  await page.getByRole('navigation').getByRole('button',{name:'Add a Course',exact:true}).click();
  await page.getByRole('button',{name:/Create New Section/}).click();
};
export const createSection=async page=>{
  await startCreate(page);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Create Section',exact:true}).click();
  await page.getByRole('button',{name:'Go to Course'}).click();
};
export const expectPoints=async(page,value)=>expect(page.locator('.progress-card .points')).toHaveText(value+' / 100');
export const recordScore=async(page,name,value)=>{
  await page.getByRole('button',{name:new RegExp('^'+name+' .*Weight')}).click();
  await page.getByLabel(name+' Score',{exact:true}).fill(String(value));
  await page.getByRole('button',{name:'Save '+name,exact:true}).click();
};
