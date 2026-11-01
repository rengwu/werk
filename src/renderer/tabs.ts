import type {KeyboardEvent} from 'react';
export function tabKeys(event:KeyboardEvent<HTMLElement>){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const current=tabs.indexOf(event.target as HTMLButtonElement);if(current<0)return;
  event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[index]?.focus();tabs[index]?.click();
}
