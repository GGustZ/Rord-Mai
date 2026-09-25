import { test, expect } from '@playwright/test';
const login=async(page,token)=>{
  await page.route('**/src/line-client.js',route=>route.fulfill({
    contentType:'application/javascript',
    body:'export default {init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> '+JSON.stringify(token)+'};',
  }));
  await page.goto('/');
  await page.getByRole('checkbox',{name:/I agree/}).check();
  await page.getByRole('button',{name:'Agree and continue'}).click();
  await expect(page.getByText('Storage consent is active.')).toBeVisible();
};
test('two students create/join, save scores, revise shared weights and delete owner data',async({page,context},testInfo)=>{
  await login(page,'browser-creator-'+testInfo.project.name);
  await page.getByRole('button',{name:'Create a section',exact:true}).click();
  await page.getByRole('button',{name:'Save section',exact:true}).click();
  await expect(page.getByText('Current weighted points:')).toContainText('0 / 100');
  const code=(await page.getByText(/Join code:/).textContent()).match(/Join code:\s*([A-Z0-9]{6})/)[1];
  await page.getByLabel('Midterm score',{exact:true}).fill('80');
  await page.getByRole('button',{name:'Save Midterm',exact:true}).click();
  await expect(page.getByText('Current weighted points:')).toContainText('32 / 100');

  const friend=await context.newPage();
  await login(friend,'browser-classmate-'+testInfo.project.name);
  await friend.getByLabel('Section join code',{exact:true}).fill(code);
  await friend.getByRole('button',{name:'Join section',exact:true}).click();
  await expect(friend.getByText('Current weighted points:')).toContainText('0 / 100');
  await expect(friend.getByRole('button',{name:'Correct shared weights'})).toHaveCount(0);
  await friend.getByLabel('Midterm score',{exact:true}).fill('60');
  await friend.getByRole('button',{name:'Save Midterm',exact:true}).click();
  await expect(friend.getByText('Current weighted points:')).toContainText('24 / 100');

  await page.getByRole('button',{name:'Correct shared weights'}).click();
  await page.getByLabel('Midterm corrected weight').fill('30');
  await page.getByLabel('Final corrected weight').fill('70');
  await page.getByRole('checkbox',{name:/I checked these corrected weights/}).check();
  await page.getByRole('button',{name:'Save corrected weights'}).click();
  await expect(page.getByText('Current weighted points:')).toContainText('24 / 100');
  await expect(page.getByLabel('Midterm score',{exact:true})).toHaveValue('80');
  await page.getByRole('button',{name:'Save target and calculate'}).click();
  await expect(page.getByText(/Required on remaining assessments:/)).toContainText('80%');
  await page.screenshot({path:testInfo.outputPath('course-revision.png'),fullPage:true});

  await friend.getByRole('button',{name:'Refresh course and weights'}).click();
  await expect(friend.getByText('Current weighted points:')).toContainText('18 / 100');
  await expect(friend.getByText(/The creator changed grading weights/)).toBeVisible();
  await expect(friend.getByLabel('Midterm score',{exact:true})).toHaveValue('60');
  await page.getByRole('checkbox',{name:/I confirm deletion/}).check();
  await page.getByRole('button',{name:'Delete my data',exact:true}).click();
  await expect(page.getByRole('button',{name:'Agree and continue'})).toBeVisible();
  await friend.getByRole('button',{name:'Refresh course and weights'}).click();
  await expect(friend.getByText('Current weighted points:')).toContainText('18 / 100');
  await friend.close();
});

