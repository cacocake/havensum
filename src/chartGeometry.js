export function ringSegments(parts){
 const positive=parts.filter(p=>Number.isFinite(p.amount)&&p.amount>0),sum=positive.reduce((s,p)=>s+p.amount,0);
 let offset=0;
 return positive.map(p=>{const fraction=p.amount/sum,result={...p,fraction,start:offset};offset+=fraction;return result;});
}
export function barLayout(width,count){const left=34,right=6,band=Math.max(1,(width-left-right)/Math.max(count,1)),gap=Math.min(4,band*.12),bar=Math.min(22,(band-gap)*.34);return {left,band,gap,bar};}
