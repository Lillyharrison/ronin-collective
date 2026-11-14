import {render,screen,fireEvent} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({language:'es'})}));
vi.mock('@/hooks/useEntryTranslation',()=>({useEntryTranslation:()=>({translated:['Jabón','Cepillo']})}));
import {ContentTranslationScope,TranslationNotice,useContentText} from './ContentTranslation';
function Items(){const text=useContentText();return <><TranslationNotice/><p>{text('Soap')}</p><p>{text('Brush')}</p></>;}
it('one original toggle flips every translated item and back without altering source',()=>{render(<ContentTranslationScope texts={['Soap','Brush']}><Items/></ContentTranslationScope>);expect(screen.getByText('Jabón')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/Ver original/}));expect(screen.getByText('Soap')).toBeInTheDocument();expect(screen.getByText('Brush')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/Ver traducción/}));expect(screen.getByText('Jabón')).toBeInTheDocument();expect(screen.getByText('Cepillo')).toBeInTheDocument();});
