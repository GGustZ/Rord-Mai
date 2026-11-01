import { test, expect } from '@playwright/test';
test.beforeEach(async ({page}) => {
  await page.route('**/src/line-client.js',route=>route.fulfill({
    contentType:'application/javascript',
    body:"export default {init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> 'test-only-id-token'};",
  }));
});
test('decline, explicit grant, course empty state and confirmed deletion',async({page},testInfo)=>{
  let storage=false, writes=0, deletions=0;
  await page.route('**/api/config',route=>route.fulfill({json:{data:{liffId:'123-test',policyVersion:'v1'}}}));
  await page.route('**/api/v1/**',async route=>{
    const req=route.request();
    expect(req.headers().authorization).toBe('Bearer test-only-id-token');
    if(req.url().endsWith('/consents')||req.url().endsWith('/consents/storage')) {
      if(req.method()==='PUT') {
        expect(req.postDataJSON()).toEqual({storage:true,policyVersion:'v1'});
        storage=true;writes++;
      }
      return route.fulfill({json:{data:{storage,crossBorderExplanation:false,policyVersion:'v1',updatedAt:null}}});
    }
    if(req.url().endsWith('/consents/cross-border-explanation')){
      expect(req.postDataJSON()).toEqual({crossBorderExplanation:false,policyVersion:'v1'});
      return route.fulfill({json:{data:{storage,crossBorderExplanation:false,policyVersion:'v1'}}});
    }
    if(req.url().endsWith('/me/profile'))return route.fulfill({json:{data:{currentGpa:null,creditsCounted:null,academicYear:2026,semester:1}}});
    if(req.url().endsWith('/enrollments'))return route.fulfill({json:{data:{items:[],nextCursor:null}}});
    if(req.url().endsWith('/me/data')) {
      expect(req.method()).toBe('DELETE');
      expect(req.postDataJSON()).toEqual({confirmDeletion:true});
      storage=false;deletions++;
      return route.fulfill({status:204});
    }
    return route.fulfill({status:404});
  });
  await page.goto('/');
  const agree=page.getByRole('button',{name:'Agree & Continue'});
  await expect(agree).toBeDisabled();
  await page.getByRole('button',{name:'Decline',exact:true}).click();
  expect(writes).toBe(0);
  await page.getByRole('checkbox',{name:/Allow RordMai to store/}).check();
  await agree.click();
  await expect(page.getByRole('heading',{name:'AI Explanations',exact:true})).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Save profile & Continue'}).click();await page.getByRole('button',{name:'Go to My Courses'}).click();
  await expect(page.getByRole('heading',{name:'My Courses',exact:true})).toBeVisible();
  await expect(page.getByText(/No courses yet/)).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('consent-active.png'),fullPage:true});
  await page.getByRole('navigation').getByRole('button',{name:'Help & Settings'}).click();
  await expect(page.getByText('You have allowed academic data storage')).toBeVisible();
  const remove=page.getByRole('button',{name:'Delete my data',exact:true});
  await expect(remove).toBeDisabled();
  await page.getByRole('checkbox',{name:/I confirm deletion/}).check();
  await remove.click();
  await expect(agree).toBeVisible();
  expect(writes).toBe(1);expect(deletions).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('server error is visible and does not claim consent succeeded',async({page})=>{
  await page.route('**/api/config',route=>route.fulfill({json:{data:{liffId:'123-test'}}}));
  await page.route('**/api/v1/consents',route=>route.fulfill({status:503,json:{error:{message:'LINE verification is unavailable. Please retry.'}}}));
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText('LINE verification is unavailable. Please retry.');
  await expect(page.getByText('You have allowed academic data storage')).toHaveCount(0);
});
