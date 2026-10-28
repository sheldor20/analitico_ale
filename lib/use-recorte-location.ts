'use client';
import {useEffect,useRef,useState} from 'react';
import {navigationSearch,readNavigation,type NavigationState} from './navigation-state.mjs';
/** Only allow-listed navigation is stored. Contacts, drafts and selections never enter the URL. */
export function useRecorteLocation({owner,ready,state,restore,openYear,years}:{owner:string|null;ready:boolean;state:NavigationState;restore:(next:NavigationState)=>boolean;openYear:(year:number)=>Promise<boolean|void>;years:number[]}){
 const latest=useRef({state,restore,openYear,years});latest.current={state,restore,openYear,years};
 const initialized=useRef(''),previous=useRef(''),major=useRef('');const [pending,setPending]=useState<NavigationState|null>(null);
 useEffect(()=>{
  if(!ready||!owner||initialized.current===owner)return;
  initialized.current=owner;previous.current=navigationSearch(latest.current.state);major.current=`${latest.current.state.area}:${latest.current.state.tab}:${latest.current.state.year}`;
  const initial=readNavigation(window.location.search);if(Object.keys(initial).length)setPending(initial);
 },[ready,owner]);
 useEffect(()=>{
  if(!owner)return;
  const pop=()=>{const next=readNavigation(window.location.search);setPending(Object.keys(next).length?next:{area:'overview',tab:'overview',central:'all',coop:'all',pa:'all',group:'all'});};
  window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
 },[owner]);
 useEffect(()=>{
  if(!pending||!ready)return;
  if(pending.year&&pending.year!==state.year&&years.includes(pending.year)){void latest.current.openYear(pending.year).then(result=>{if(result===false){setPending(null);window.history.replaceState({},'',window.location.pathname+navigationSearch(latest.current.state));}});return;}
  const restored=latest.current.restore(pending);previous.current='';setPending(null);
  if(!restored)window.history.replaceState({},'',window.location.pathname+navigationSearch(latest.current.state));
 },[pending,ready,state.year]);
 const encoded=navigationSearch(state);
 useEffect(()=>{
  if(!ready||!owner||initialized.current!==owner||pending)return;
  const nextMajor=`${state.area}:${state.tab}:${state.year}`;
  if(previous.current&&previous.current!==encoded){const url=window.location.pathname+encoded;window.history[nextMajor!==major.current?'pushState':'replaceState']({},'',url);}
  previous.current=encoded;major.current=nextMajor;
 },[encoded,owner,ready,pending]);
}
