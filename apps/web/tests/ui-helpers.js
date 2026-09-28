import { expect } from '@playwright/test';
export const login=async(page,token)=>{
  await page.route('**/src/line-client.js',route=>route.fulfill({contentType:'application/javascript',body:'export default {init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> '+JSON.stringify(token)+'};'}));
  await page.goto('/');
  await page.getByRole('checkbox',{name:/I agree/}).check();
  await page.getByRole('button',{name:'Agree and continue'}).click();
  await expect(page.getByRole('heading',{name:'My courses',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Refresh courses'})).toBeEnabled();
};
export const startCreate=async page=>{
  await page.getByRole('navigation').getByRole('button',{name:'Add course',exact:true}).click();
  await page.getByRole('button',{name:/Create a section/}).click();
};
export const createSection=async page=>{
  await startCreate(page);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Create section',exact:true}).click();
  await page.getByRole('button',{name:'Go to course'}).click();
};
export const expectPoints=async(page,value)=>expect(page.locator('.progress-card .points')).toHaveText(value+' / 100');
export const recordScore=async(page,name,value)=>{
  await page.getByRole('button',{name:new RegExp('^'+name+' .*weight')}).click();
  await page.getByLabel(name+' score',{exact:true}).fill(String(value));
  await page.getByRole('button',{name:'Save '+name,exact:true}).click();
};
