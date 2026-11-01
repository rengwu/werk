import { useEffect, useId } from 'react';
const dirty = new Set<string>();
export const hasDirtyEdits = () => dirty.size > 0;
export function useDirty(value: boolean) {
  const id = useId();
  useEffect(() => { if(value)dirty.add(id);else dirty.delete(id);window.dispatchEvent(new Event('werk:dirty'));return()=>{dirty.delete(id);window.dispatchEvent(new Event('werk:dirty'));}; },[id,value]);
}
window.addEventListener('beforeunload', event => { if(dirty.size){event.preventDefault();event.returnValue='';} });
