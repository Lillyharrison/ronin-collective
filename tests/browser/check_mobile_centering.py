import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
 Path('/tmp/browser/centering').mkdir(parents=True, exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={"width":390,"height":844})
  page=await context.new_page()
  await page.goto('http://localhost:8080',wait_until='domcontentloaded')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
  try: await page.reload(wait_until='domcontentloaded')
  except Exception: pass
  await page.get_by_role('button',name='Open menu',exact=True).wait_for(timeout=60000)
  await page.wait_for_timeout(3000)
  results=[]
  for scale in [1,1.2,1.4]:
   await page.evaluate('(s)=>{document.documentElement.style.setProperty("--text-scale",s);document.documentElement.dataset.enlargedText=String(s>1)}',scale)
   await page.wait_for_timeout(700)
   result=await page.evaluate('''()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,centre:r.left+r.width/2}};
    const row=document.querySelector('.app-header-row');const logo=document.querySelector('.app-header-title img');
    const buttons=[...document.querySelectorAll('nav.fixed.bottom-0 button')];
    const title=rect(document.querySelector('.app-header-title')); const left=rect(row.firstElementChild);const right=rect(row.lastElementChild);
    return {logo:rect(logo),messages:rect(buttons.find(b=>b.getAttribute('aria-label')==='Messages')),slots:buttons.map(rect),overlap:title.left<left.right-0.1||title.right>right.left+0.1,overflow:document.documentElement.scrollWidth>innerWidth,flow:row.dataset.titleFlow};
   }''')
   result['scale']=scale
   assert not result['overlap'],result
   assert not result['overflow'],result
   assert abs(result['messages']['centre']-195)<2,result
   if scale==1: assert abs(result['logo']['centre']-195)<2,result
   widths=[x['width'] for x in result['slots']]
   assert max(widths)-min(widths)<1,result
   await page.screenshot(path=f'/tmp/browser/centering/scale-{scale}.png')
   results.append(result)
  # Controlled 4/3-slot checks leave permissions and saved data untouched.
  for hidden in [['maintenance'],['maintenance','properties']]:
   slots=await page.evaluate("""(hidden)=>{
    const buttons=[...document.querySelectorAll('nav.fixed.bottom-0 button')];
    buttons.forEach(b=>b.style.display=hidden.includes(b.getAttribute('aria-label').toLowerCase())?'none':'');
    return buttons.filter(b=>b.style.display!=='none').map(b=>{const r=b.getBoundingClientRect();return {width:r.width,centre:r.left+r.width/2}});
   }""",hidden)
   assert len(slots)==5-len(hidden),slots
   assert max(s['width'] for s in slots)-min(s['width'] for s in slots)<1,slots
   gaps=[slots[i+1]['centre']-slots[i]['centre'] for i in range(len(slots)-1)]
   assert max(gaps)-min(gaps)<1,slots
  print(json.dumps(results,indent=2))
  await browser.close()
asyncio.run(main())
