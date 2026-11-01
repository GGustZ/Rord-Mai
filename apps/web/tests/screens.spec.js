import { test,expect } from '@playwright/test';
import { login,startCreate,expectPoints,recordScore } from './ui-helpers.js';

test('Stitch screens fit narrow phones, preserve drafts, validate entries and show real target states',async({page},info)=>{
  test.setTimeout(60000);
  const fit=async name=>{
    await expect(page.locator('section.screen')).toHaveAttribute('aria-busy','false');
    const widths=info.project.name==='phone'?[320,360,390]:[1280];
    for(const width of widths){
      await page.setViewportSize({width,height:info.project.name==='phone'?844:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' at '+width).toBe(true);
      const controls=await page.locator('button:visible,input:visible:not([type=checkbox]),select:visible').evaluateAll(elements=>elements.filter(el=>el.getBoundingClientRect().width>innerWidth||el.getBoundingClientRect().height<44).map(el=>({text:el.textContent,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
      expect(controls,name+' has usable controls').toEqual([]);
    }
    await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true,style:'.bottom-nav{position:static!important}'});
    await page.screenshot({path:info.outputPath(name+'-viewport.png')});
  };
  await login(page,'browser-flow-'+info.project.name);await fit('01-courses');
  await page.getByRole('navigation').getByRole('button',{name:'Add a Course',exact:true}).click();await fit('02-add');
  await page.getByRole('button',{name:/Join Existing Section/}).click();await fit('03-join');
  await page.getByLabel('6-character Join Code').fill('ZZZZZZ');await page.getByRole('button',{name:'Join Section',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:/Create New Section/}).click();
  await page.getByLabel('Course Code',{exact:true}).fill('DEMO-RESPONSIVE-COURSE-CODE');
  await page.getByLabel('Course Name',{exact:true}).fill('Fictional interactive web programming and academic planning studio');await fit('04-basic-information');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Weight (%)',{exact:true}).nth(0).fill('30');
  await expect(page.getByText('Add 10% to reach 100%')).toBeVisible();await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByLabel('Course Code',{exact:true})).toHaveValue('DEMO-RESPONSIVE-COURSE-CODE');
  await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByLabel('Weight (%)',{exact:true}).nth(0)).toHaveValue('30');
  await page.getByLabel('Weight (%)',{exact:true}).nth(0).fill('40');await fit('05-assessments');
  await page.getByRole('button',{name:'Continue',exact:true}).click();await fit('06-thresholds');
  await page.getByRole('button',{name:'Create Section',exact:true}).click();await expect(page.getByRole('heading',{name:'Section Created!',exact:true})).toBeVisible();await fit('07-created');
  await page.getByRole('button',{name:'Go to Course'}).click();await expectPoints(page,0);await fit('08-detail');
  await recordScore(page,'Midterm',0);await expectPoints(page,0);
  await expect(page.getByText('Raw score: 0 / 100')).toBeVisible();await expect(page.getByRole('progressbar')).toHaveAttribute('value','40');
  await page.getByRole('button',{name:/Target Grade A/}).click();await page.getByRole('button',{name:'Save target and calculate'}).click();
  await expect(page.getByText('Target Impossible under the current structure')).toBeVisible();await fit('09-target-unreachable');
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:/^Midterm .*Weight/}).click();
  await expect(page.getByRole('button',{name:'Attendance',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Attended Sessions',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Remove entry Midterm'}).click();
  await page.getByLabel('Midterm Score',{exact:true}).fill('101');await page.getByRole('button',{name:'Save Midterm',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Add Score or Attendance',exact:true})).toBeVisible();
  await page.getByLabel('Midterm Score',{exact:true}).fill('80');await fit('10-marks-entry');await page.getByRole('button',{name:'Save Midterm',exact:true}).click();await expectPoints(page,32);
  await expect(page.getByText('Raw score: 80 / 100')).toBeVisible();
  await recordScore(page,'Final',0);await page.getByRole('button',{name:/Target Grade A/}).click();await page.getByRole('button',{name:'Save target and calculate'}).click();await expect(page.getByText('No remaining assessment weight')).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();await recordScore(page,'Final',100);
  await recordScore(page,'Midterm',100);await expectPoints(page,100);
  await page.getByRole('button',{name:/Target Grade A/}).click();await page.getByRole('button',{name:'Save target and calculate'}).click();await expect(page.getByText('Target Already Achieved')).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Edit shared structure'}).click();await fit('11-correction');
  await page.getByRole('navigation').getByRole('button',{name:'Help & Settings'}).click();await fit('12-privacy');
  await startCreate(page);await page.getByLabel('Example structure').selectOption('norm');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();await page.getByRole('button',{name:'Create Section',exact:true}).click();await page.getByRole('button',{name:'Go to Course'}).click();
  await expect(page.getByText(/Norm-referenced course: letter grades depend on class results/)).toBeVisible();await expect(page.getByRole('button',{name:/Target Grade/})).toHaveCount(0);await fit('13-norm-detail');
  await page.getByRole('navigation').getByRole('button',{name:'Courses',exact:true}).click();await expect(page.locator('.course-card')).toHaveCount(2);await fit('14-course-cards');
});

test('a failed read after creation retries the read without creating a second section',async({page},info)=>{
  await login(page,'browser-retry-'+info.project.name);let writes=0,fail=true;
  await page.route('**/api/v1/sections',async route=>{if(route.request().method()==='POST')writes++;await route.continue();});
  await page.route('**/api/v1/enrollments/*',async route=>{if(route.request().method()==='GET'&&fail){fail=false;await route.fulfill({status:503,json:{error:{message:'Temporary read failure. Retry opening the course.'}}});}else await route.continue();});
  await startCreate(page);await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Create Section',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Section Created!',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Go to Course'}).click();await expect(page.getByRole('alert')).toHaveText('Temporary read failure. Retry opening the course.');
  await page.getByRole('button',{name:'Go to Course'}).click();await expectPoints(page,0);expect(writes).toBe(1);
});
