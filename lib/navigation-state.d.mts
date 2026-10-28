export type NavigationState={area?:string;tab?:string;source?:string;metric?:string;period?:string;level?:string;year?:number;month?:number;central?:string;coop?:string;pa?:string;group?:string};
export function readNavigation(search:string):NavigationState;
export function navigationSearch(state:NavigationState):string;
