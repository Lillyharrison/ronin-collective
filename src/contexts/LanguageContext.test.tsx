import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({id:'self',pref:'es',update:vi.fn(),eq:vi.fn(),fail:false}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:m.id?{id:m.id}:null})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({
  select:()=>({eq:()=>({maybeSingle:async()=>({data:{language_pref:m.pref}})})}),
  update:(v:unknown)=>{m.update(v);return {eq:(...args:unknown[])=>{m.eq(...args);return m.fail?Promise.reject(new Error('offline')):Promise.resolve({error:null});}};},
})}}));
import {LanguageProvider,useLanguage} from './LanguageContext';
function Consumer(){const {language,setLanguage}=useLanguage();return <button onClick={()=>setLanguage(language==='es'?'en':'es')}>{language}</button>;}
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();m.id='self';m.pref='es';m.fail=false;});
it('starts from profile without writing a preference',async()=>{render(<LanguageProvider><Consumer/></LanguageProvider>);await screen.findByText('es');expect(m.update).not.toHaveBeenCalled();expect(localStorage.getItem('ronin.language')).toBeNull();});
it('switches immediately and writes only own language_pref',async()=>{localStorage.setItem('ronin.language','en');render(<LanguageProvider><Consumer/></LanguageProvider>);fireEvent.click(screen.getByText('en'));expect(screen.getByText('es')).toBeInTheDocument();expect(m.update).toHaveBeenCalledExactlyOnceWith({language_pref:'es'});expect(m.eq).toHaveBeenCalledExactlyOnceWith('id','self');expect(localStorage.getItem('ronin.language')).toBe('es');});
it('keeps explicit device choice and silently keeps switch on failure',async()=>{m.fail=true;localStorage.setItem('ronin.language','en');render(<LanguageProvider><Consumer/></LanguageProvider>);fireEvent.click(screen.getByText('en'));await waitFor(()=>expect(screen.getByText('es')).toBeInTheDocument());expect(localStorage.getItem('ronin.language')).toBe('es');});
it('signed-out toggle never writes a profile',()=>{m.id='';render(<LanguageProvider><Consumer/></LanguageProvider>);fireEvent.click(screen.getByText('en'));expect(m.update).not.toHaveBeenCalled();});
