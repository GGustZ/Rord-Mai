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
    if(req.url().endsWith('/consents')) {
      if(req.method()==='PUT') {
        expect(req.postDataJSON()).toEqual({storage:true,crossBorderExplanation:false,policyVersion:'v1'});
        storage=true;writes++;
      }
      return route.fulfill({json:{data:{storage,crossBorderExplanation:false,policyVersion:'v1',updatedAt:null}}});
    }
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
  const agree=page.getByRole('button',{name:'Agree and continue'});
  await expect(agree).toBeDisabled();
  await page.getByRole('button',{name:'Decline',exact:true}).click();
  expect(writes).toBe(0);
  await page.getByRole('checkbox',{name:/I agree/}).check();
  await agree.click();
  await expect(page.getByText('Storage consent is active.')).toBeVisible();
  await page.getByRole('button',{name:'View my courses'}).click();
  await expect(page.getByText(/No courses joined yet/)).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('consent-active.png'),fullPage:true});
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
  await expect(page.getByText('Storage consent is active.')).toHaveCount(0);
});
