const randomUUID=()=>globalThis.crypto.randomUUID();
export const FACTS=[['when','集合時間'],['where','雨天の場所'],['materials','用意するもの'],['steps','作業の順番'],['why','その理由'],['contact','確認先']];
export const DEMO={event:'青葉地区の夏祭り',task:'提灯の準備',question:'雨の日、提灯はどこで、どう準備すればいいですか？',speaker:'田中さん（架空の語り部）',lines:[
 '祭りの前日は、いつもの場所に朝9時に集まります。',
 '晴れなら公民館の裏庭です。雨なら公民館の集会室で、紙の提灯を組み立てます。',
 '紙の提灯が濡れないようにするためです。外につるすかは、当日の責任者の佐藤さんに確認してください。',
 '紙の提灯とひも、はさみを用意します。まず紙の提灯を組み立てて、それからひもを通します。'
]};
export const emptyCard=()=>({title:'雨の日の提灯準備',facts:Object.fromEntries(FACTS.map(([k,label])=>[k,{label,value:'未確認',sourceIds:[],status:'unknown'}]))});
export function validateRequest(r){if(!r||typeof r.question!=='string'||!r.question.trim())throw Error('聞きたいことを入力してください');return {id:randomUUID(),event:String(r.event||DEMO.event).slice(0,100),task:String(r.task||DEMO.task).slice(0,100),question:r.question.trim().slice(0,1000),speaker:String(r.speaker||'地域の経験者').slice(0,100),status:'requested',turns:[],createdAt:new Date().toISOString(),metrics:{},sampleData:Boolean(r.sampleData)}}
export function localCard(turns){let c=emptyCard();const spoken=turns.filter(t=>t.role==='user');let put=(k,v,t)=>{c.facts[k]={...c.facts[k],value:v,sourceIds:[t.id],status:'stated'}};
 for(const t of spoken){let s=t.text;
  const time=s.match(/(?:朝|午前|午後|夕方)?\s*\d{1,2}時(?:\d{1,2}分)?/);if(time)put('when',(/祭りの前日|祭り前日/.test(s)?'祭りの前日、':'')+time[0].trim(),t);
  const where=s.match(/(?:雨なら|雨の日は|雨天時は|雨のときは)[、\s]*([^。\n]+?)(?:で[、\s]*(?:紙の|提灯|準備|作業)|です|。|$)/);if(where)put('where',where[1].replace(/で$/,''),t);
  const why=s.match(/([^。\n]+?(?:ためです|ため|からです))/);if(why&&/濡|ぬれ|紙|雨|水/.test(why[1]))put('why',why[1],t);
  const contact=s.match(/([^。\n]*?(?:責任者|担当者)[^。\n]*?(?:確認してください|確認します|聞いてください))/);if(contact)put('contact',contact[1],t);
  const mat=s.match(/([^。\n]+?)(?:を用意します|を持ってきて|が必要です)/);if(mat)put('materials',mat[1],t);
  const steps=s.match(/((?:まず|最初に)[^。\n]+(?:。[^\n]+)?)/);if(steps)put('steps',steps[1],t);
  const correction=s.match(/^確認時の追記（([^）]+)）：([\s\S]+)$/);if(correction){const key=FACTS.find(([,l])=>l===correction[1])?.[0];if(key)put(key,correction[2],t);}
 }
 return c;
}
export function localFollowup(request,turns){const users=turns.filter(t=>t.role==='user');const card=localCard(turns),last=users.at(-1)?.text||'';
 if(!users.length)return `「${request.question}」という質問が届いています。まず、準備する日の流れを教えていただけますか？`;
 if(/いつもの|あそこ|例の場所/.test(last)&&card.facts.where.status==='unknown')return '「いつもの場所」は、初めて担当する人にはどこでしょうか。雨の日と晴れの日で、場所は変わりますか？';
 if(card.facts.where.status==='unknown')return '雨の日は、具体的にどこへ行けばよいですか？ 建物や部屋の名前を教えてください。';
 if(card.facts.why.status==='unknown')return '雨の日にその場所で準備するのは、どうしてですか？ 初めての人が気をつける理由も教えてください。';
 if(card.facts.materials.status==='unknown'||card.facts.steps.status==='unknown')return '何を用意して、どの順番で作業しますか？ 判断に迷ったときに確認する相手も、分かれば教えてください。';
 return 'ありがとうございます。お話から手引きの下書きを作れます。分からないことは未確認のまま残して、最後に一緒に確かめましょう。';}
export function normalizeCard(raw,turns){const c=emptyCard(),allowed=new Set(turns.filter(t=>t.role==='user').map(t=>t.id));if(raw?.title)c.title=String(raw.title).slice(0,150);
 for(const[k]of FACTS){const f=raw?.facts?.[k];if(!f)continue;let ids=Array.isArray(f.sourceIds)?f.sourceIds.filter(x=>allowed.has(x)):[];if(ids.length&&typeof f.value==='string'&&f.value.trim()&&f.value!=='未確認')c.facts[k]={...c.facts[k],value:f.value.slice(0,1500),sourceIds:[...new Set(ids)],status:'stated'};}
 return c;
}
export function sourceText(turns){return turns.filter(t=>t.role==='user').map(t=>`[${t.id}] ${t.text}`).join('\n')}
export function reviewCard(request,input){const c=normalizeCard(input,request.turns);if(!input?.confirmed)throw Error('内容を確認し、確認済みにチェックしてください');return {...c,confirmedAt:new Date().toISOString(),confirmedBy:request.speaker,requestId:request.id}}
export function assessAnswers(card,answers){const keys=['when','where','why','contact'];return keys.map(k=>({key:k,label:card.facts[k].label,expected:card.facts[k].value,answer:String(answers?.[k]||''),needsReview:true}));}
export function answerKeys(question,card){const rules={when:/何時|集合|時間/,where:/どこ|場所|会場/,materials:/用意|持ち物|必要な物|道具/,steps:/手順|順番|どう準備|どうやって/,why:/なぜ|どうして|理由/,contact:/誰|だれ|確認先|責任者|担当/};const keys=Object.entries(rules).filter(([k,re])=>re.test(question)&&card.facts[k]?.status!=='unknown').map(([k])=>k);return keys}
