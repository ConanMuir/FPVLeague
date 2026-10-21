// ---------- Math.hypot without the allocation ----------
// Leaf module (no imports). V8's Math.hypot copies its arguments into a new array on every call; the map SDFs (arena, Highlands, caves,
// terrain) and the bots call it thousands of times a tick, which made it the largest source of garbage in a match. hyp2 / hyp3 are V8's
// own algorithm (largest value first, then a Kahan sum of the squares normalised by it, sqrt(sum) * largest), so they return the same
// double bit for bit in Chrome / Edge / node (checked over 5 million random pairs and triples of mixed magnitude) and the golden tests
// still pass unchanged. Infinity wins over NaN, as in Math.hypot.
export function hyp2(a,b){a=a<0?-a:a;b=b<0?-b:b;if(a!==a||b!==b)return a===Infinity||b===Infinity?Infinity:NaN;const m=a>b?a:b;if(m===Infinity)return Infinity;if(m===0)return 0;
 let n=a/m,s=n*n,k=(s-0)-s,y,t;n=b/m;y=n*n-k;t=s+y;return Math.sqrt(t)*m}
export function hyp3(a,b,c){a=a<0?-a:a;b=b<0?-b:b;c=c<0?-c:c;if(a!==a||b!==b||c!==c)return a===Infinity||b===Infinity||c===Infinity?Infinity:NaN;let m=a>b?a:b;if(c>m)m=c;if(m===Infinity)return Infinity;if(m===0)return 0;
 let n=a/m,s=n*n,k=(s-0)-s,y,t;n=b/m;y=n*n-k;t=s+y;k=(t-s)-y;s=t;n=c/m;y=n*n-k;t=s+y;return Math.sqrt(t)*m}
