import { routeEngine } from '../planner-assets';
export async function GET(){return new Response(routeEngine,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}})}
