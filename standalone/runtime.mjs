import {AsyncLocalStorage} from 'node:async_hooks';
export const context=new AsyncLocalStorage();
export const getChatGPTUser=async()=>context.getStore()?.user??null;
// Small D1-compatible adapter lets both deployments use the same API implementation.
export const env={DB:{prepare(sql){let values=[];const query={
 bind(...args){values=args;return query},
 async first(){return context.getStore().db.prepare(sql).get(...values)??null},
 async run(){const result=context.getStore().db.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}}}
};return query}}};
