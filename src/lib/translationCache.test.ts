import {beforeEach,describe,it,expect,vi} from 'vitest';
import {translationKey,readTranslation,saveTranslation,clearTranslations,translationChunks,translationCandidates,shouldTranslate} from './translationCache';
beforeEach(()=>{clearTranslations();localStorage.clear();});
describe('successful translation cache',()=>{
 it('persists by own user, source hash and target',()=>{saveTranslation('a','Soap 12 ml','Jabón 12 ml');expect(localStorage.getItem(translationKey('a','Soap 12 ml','es'))).toBe('Jabón 12 ml');expect(readTranslation('b','Soap 12 ml')).toBeUndefined();expect(readTranslation('a','Soap 13 ml')).toBeUndefined();expect(translationKey('a','Soap 12 ml','en')).not.toBe(translationKey('a','Soap 12 ml','es'));});
 it('reads persistent storage after module reload',async()=>{saveTranslation('a','Soap','Jabón');vi.resetModules();const fresh=await import('./translationCache');expect(fresh.readTranslation('a','Soap')).toBe('Jabón');});
 it('never stores a failure, empty response or original',()=>{for(const result of [null,undefined,'','Soap'])saveTranslation('a','Soap',result);expect(readTranslation('a','Soap')).toBeUndefined();expect(localStorage.length).toBe(0);});
 it('clears account translations without removing language choice',()=>{localStorage.setItem('ronin.language','es');saveTranslation('a','Soap','Jabón');clearTranslations();expect(readTranslation('a','Soap')).toBeUndefined();expect(localStorage.getItem('ronin.language')).toBe('es');});
 it('deduplicates and excludes short, numeric and URL strings',()=>{expect(translationCandidates(['Soap','Soap','','ab','123','12.5','https://a.com','www.a.com','Soap 12 ml'])).toEqual(['Soap','Soap 12 ml']);});
 it('chunks at 40 unique texts',()=>{const texts=Array.from({length:85},(_,i)=>`Item ${i}`);expect(translationChunks([...texts,...texts]).map(c=>c.length)).toEqual([40,40,5]);});
 it('only Spanish, online and signed-in can call',()=>{expect(shouldTranslate('es',true,'a')).toBe(true);expect(shouldTranslate('en',true,'a')).toBe(false);expect(shouldTranslate('es',false,'a')).toBe(false);expect(shouldTranslate('es',true,null)).toBe(false);});
});
