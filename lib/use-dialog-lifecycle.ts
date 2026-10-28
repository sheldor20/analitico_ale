'use client';
import {useLayoutEffect,useRef,type RefObject,type KeyboardEvent} from 'react';
import {lockBodyScroll} from './body-scroll-lock.mjs';
const selector='button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,iframe,[tabindex="0"]';
const focusable=(element:HTMLElement)=>[...element.querySelectorAll<HTMLElement>(selector)].filter(node=>node.getClientRects().length>0&&!node.closest('[hidden]'));
/** All dialogs share focus, Escape and reference-counted page scrolling. */
export function useDialogLifecycle(onClose:()=>void,initial:RefObject<HTMLElement|null>){
 const close=useRef(onClose);close.current=onClose;
 useLayoutEffect(()=>{
  const opener=document.activeElement as HTMLElement|null;
  const own=initial.current?.closest<HTMLElement>('[role="dialog"]');
  const release=lockBodyScroll();initial.current?.focus();
  return()=>{release();queueMicrotask(()=>{
   const others=[...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter(node=>node!==own&&node.isConnected);
   const top=others.at(-1);if(top){focusable(top)[0]?.focus();}else if(opener?.isConnected)opener.focus();
  });};
 },[]);
 return (event:KeyboardEvent<HTMLElement>)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}
  if(event.key!=='Tab')return;
  const nodes=focusable(event.currentTarget),active=document.activeElement;
  if(!nodes.length){event.preventDefault();event.currentTarget.focus();return;}
  if(event.shiftKey&&(active===nodes[0]||active===event.currentTarget)){event.preventDefault();nodes.at(-1)?.focus();}
  else if(!event.shiftKey&&(active===nodes.at(-1)||!event.currentTarget.contains(active))){event.preventDefault();nodes[0].focus();}
 };
}
