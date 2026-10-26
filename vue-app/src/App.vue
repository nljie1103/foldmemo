<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Home, NotebookTabs, Tags, Settings2, PanelLeftClose, Plus, Search, Star, Eye, EyeOff, Copy, ExternalLink, Trash2, Lock, Unlock, FileDown, Upload, Download, ShieldCheck, Save, GripVertical, Pencil, ArrowLeft, Check, BookOpen, Menu, Moon, Sun } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { isLegacy, decodeLegacy } from '@/lib/legacy'
import { id, newVault, validate, pack, unpack, verifier, filename, htmlWithVault, download, normalizedUrl, initialPackage, type Vault, type Item, type Field, type Category, type FieldType, type Package } from '@/lib/vault'

type Page='home'|'notes'|'categories'|'settings'
const tx=(zh:string,en:string)=>vault.value?.appearance.language==='en'?en:zh
const vault=ref<Vault|null>(null)
const page=ref<Page>('home'), sidebarOpen=ref(false), filter=ref('all'), search=ref('')
const status=ref(''), dirty=ref(false), busy=ref(false), lockMode=ref<'create'|'unlock'|'none'>('create')
const firstPack=ref<Package|null>(initialPackage()), passphrase=ref(''), openPassword=ref('')
const freshOpenEnabled=ref(true), freshStorageEnabled=ref(true), newOpeningPass=ref(''), newStoragePass=ref('')
const editorOpen=ref(false), editKind=ref<'record'|'note'>('record'), editorId=ref<string|null>(null)
const draft=reactive({title:'',categoryId:'',body:'',values:{} as Record<string,string>,favorite:false})
const categoryDialog=ref(false),categoryId=ref<string|null>(null),categoryName=ref(''),categoryFields=ref<Field[]>([])
const fieldName=ref(''),fieldType=ref<FieldType>('text')
const noteOpen=ref<Item|null>(null), visible=reactive<Record<string,boolean>>({})
const modalPassword=ref<'open'|'storage'|null>(null),oldPass=ref(''),nextPass=ref('')
const importInput=ref<HTMLInputElement|null>(null), embeddedImportInput=ref<HTMLInputElement|null>(null)
const importPackage=ref<any>(null),importPass=ref(''),importOpenPass=ref(''),importPrompt=ref(false)
const exportPrompt=ref(false),exportEncrypt=ref(true),exportPass=ref(''),includeMdPasswords=ref(false)
const uiError=ref(''),savedFile=ref(''),boundHandle=ref<FileSystemFileHandle|null>(null)
let saveTimer:ReturnType<typeof setTimeout>|undefined
let draftTimer:ReturnType<typeof setTimeout>|undefined
let writeSerial=Promise.resolve()
let changes=0
const draftKey=()=>`foldmemo-vue-1:draft:${location.href}`
const fakeStored=ref<Package|null>(null)
function getCachedPackage():Package|null{try{const v=localStorage.getItem(draftKey());return v ? (JSON.parse(v)?.pack ?? null) : null}catch{return null}}
function info(s:string){status.value=s}
function fail(e:unknown){uiError.value=e instanceof Error?e.message:String(e);info('操作失败：'+uiError.value)}
const allItems=computed(()=>[...(vault.value?.items||[])].sort((a,b)=>a.order-b.order))
const groups=computed(()=>vault.value?.categories||[])
const activeCategory=computed(()=>groups.value.find(c=>c.id===filter.value))
const counts=computed(()=>({records:allItems.value.filter(i=>i.kind==='record').length,notes:allItems.value.filter(i=>i.kind==='note').length,favorites:allItems.value.filter(i=>i.favorite).length}))
const displayed=computed(()=>allItems.value.filter(i=>(filter.value==='all'||(filter.value==='favorites'?i.favorite:i.categoryId===filter.value))&&(!search.value||`${i.title} ${i.body}`.toLowerCase().includes(search.value.toLowerCase()))))
const board=computed(()=>{const arr=[[],[],[]] as Item[][];displayed.value.forEach((it,i)=>arr[i%3].push(it));return arr})
const appearance=computed(()=>vault.value?.appearance||newVault().appearance)
const hasOpenPassword=computed(()=>vault.value?.security.openEnabled??false)
const pendingDraft=computed(()=>!!getCachedPackage())
const template=(window as Window & {__FOLDMEMO_TEMPLATE__?:string}).__FOLDMEMO_TEMPLATE__||''
function applyLook(){document.documentElement.dataset.accent=appearance.value.accent;document.documentElement.dataset.style=appearance.value.style;const dark=appearance.value.mode==='dark'||(appearance.value.mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark)}
watch(appearance,applyLook,{deep:true,immediate:true})
watch([page,filter],()=>{search.value='';noteOpen.value=null})
function mark(){if(!vault.value)return;changes++;dirty.value=true;info('仅浏览器草稿，尚未确认写入当前 HTML');clearTimeout(draftTimer);draftTimer=setTimeout(()=>{saveDraft().catch(fail)},160);if(boundHandle.value){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{writeBoundFile().catch(fail)},1100)}}
function editAppearance<K extends keyof Vault['appearance']>(name:K,value:Vault['appearance'][K]){if(!vault.value)return;vault.value.appearance[name]=value;mark()}
async function saveDraft(){if(!vault.value)return;const p=await pack(vault.value,vault.value.security.openEnabled?openPassword.value:null);localStorage.setItem(draftKey(),JSON.stringify({pack:p,time:Date.now()}));fakeStored.value=p}
function embeddedPackage():Package|null{const c=getCachedPackage();return c||firstPack.value}
async function setup(){if(!vault.value){if(freshOpenEnabled.value&&newOpeningPass.value.length<8)throw Error('打开密码至少 8 位');if(freshStorageEnabled.value&&newStoragePass.value.length<8)throw Error('存储密码至少 8 位');const v=newVault();v.security.openEnabled=freshOpenEnabled.value;v.security.storageEnabled=freshStorageEnabled.value;if(freshStorageEnabled.value){const proof=await verifier(newStoragePass.value);v.security.exportSalt=proof.salt;v.security.exportVerifier=proof.hash}vault.value=v;openPassword.value=freshOpenEnabled.value?newOpeningPass.value:'';newOpeningPass.value='';newStoragePass.value='';lockMode.value='none';mark();info('保险库已创建。请在设置中授权写入当前 HTML，以便复制文件时携带最新记录。')}}
async function unlock(){const p=embeddedPackage();if(!p){lockMode.value='create';return}const v=await unpack(p,p.encrypted?passphrase.value:null);vault.value=v;openPassword.value=v.security.openEnabled?passphrase.value:'';passphrase.value='';lockMode.value='none';applyLook();info(getCachedPackage()?'已恢复当前文件的浏览器草稿；尚未确认写入 HTML':'已从 HTML 载入保险库');await restoreHandle()}
async function attempt(action:()=>Promise<unknown>){uiError.value='';busy.value=true;try{await action()}catch(e){fail(e)}finally{busy.value=false}}
async function lock(){if(!vault.value)return;try{clearTimeout(draftTimer);await saveDraft()}catch(e){fail(e);return}if(dirty.value&&!confirm('已保存在本机草稿，但尚未确认写入 HTML。仍要锁定吗？'))return;vault.value=null;openPassword.value='';passphrase.value='';boundHandle.value=null;lockMode.value='unlock';page.value='home';editorOpen.value=false;info('保险库已锁定，浏览器草稿已保留')}
function newRecord(kind:'record'|'note'='record'){editorId.value=null;editKind.value=kind;draft.title='';draft.body='';draft.values={};draft.favorite=false;draft.categoryId=groups.value[0]?.id||'';editorOpen.value=true;noteOpen.value=null}
function editItem(it:Item){editorId.value=it.id;editKind.value=it.kind;draft.title=it.title;draft.body=it.body;draft.categoryId=it.categoryId;draft.values={...it.values};draft.favorite=it.favorite;editorOpen.value=true;noteOpen.value=null}
function saveItem(){if(!vault.value||!draft.title.trim())throw Error('请输入标题');if(editKind.value==='record'&&!groups.value.some(c=>c.id===draft.categoryId))throw Error('请先创建分类');const old=vault.value.items.find(i=>i.id===editorId.value),newIt:Item={id:old?.id||id(),title:draft.title.trim(),kind:editKind.value,categoryId:editKind.value==='note'?'':draft.categoryId,body:draft.body,values:{...draft.values},favorite:draft.favorite,updated:Date.now(),order:old?.order??(Math.max(0,...allItems.value.map(i=>i.order))+1)};if(old)Object.assign(old,newIt);else vault.value.items.push(newIt);editorOpen.value=false;mark()}
function deleteItem(it:Item){if(!vault.value||!confirm('确认删除 '+it.title+'？'))return;vault.value.items=vault.value.items.filter(i=>i.id!==it.id);noteOpen.value=null;mark()}
function favorite(it:Item){it.favorite=!it.favorite;mark()}
function categoryNew(){categoryId.value=null;categoryName.value='';categoryFields.value=[];fieldName.value='';categoryDialog.value=true}
function categoryEdit(c:Category){categoryId.value=c.id;categoryName.value=c.name;categoryFields.value=c.fields.map(f=>({...f}));categoryDialog.value=true}
function addField(){if(!fieldName.value.trim())return;categoryFields.value.push({id:id(),name:fieldName.value.trim(),type:fieldType.value});fieldName.value=''}
function saveCategory(){if(!vault.value||!categoryName.value.trim())throw Error('请输入分类名称');const c={id:categoryId.value||id(),name:categoryName.value.trim(),fields:categoryFields.value.map(f=>({...f}))};const old=vault.value.categories.find(x=>x.id===c.id);if(old)Object.assign(old,c);else vault.value.categories.push(c);categoryDialog.value=false;mark()}
function removeCategory(c:Category){if(!vault.value||vault.value.items.some(i=>i.categoryId===c.id)){info('请先移动或删除此分类下的记录');return}if(confirm('删除分类 '+c.name+'？')){vault.value.categories=vault.value.categories.filter(x=>x.id!==c.id);mark()}}
const activeEditorCategory=computed(()=>groups.value.find(c=>c.id===draft.categoryId))
function copy(s:string){navigator.clipboard.writeText(s).then(()=>info('已复制')).catch(()=>info('复制失败：请检查剪贴板权限'))}
function goUrl(s:string){const url=normalizedUrl(s);if(!url){info('无效网址：仅允许 HTTP/HTTPS');return}window.open(url,'_blank','noopener,noreferrer')}
function toggleVisible(it:Item,f:Field){const k=it.id+':'+f.id;visible[k]=!visible[k]}
function isVisible(it:Item,f:Field){return !!visible[it.id+':'+f.id]}
function fieldValue(it:Item,f:Field){return it.values[f.id]||''}
function moveItem(a:string,b:string){if(!vault.value||a===b)return;const order=allItems.value.map(x=>x.id);const x=order.indexOf(a),y=order.indexOf(b);if(x<0||y<0)return;order.splice(y,0,order.splice(x,1)[0]);for(const i of vault.value.items)i.order=order.indexOf(i.id);mark()}
let dragTimer:ReturnType<typeof setTimeout>|undefined,draggedId='',dragReady=false,downX=0,downY=0
function dragStart(ev:PointerEvent,item:Item){if((ev.target as HTMLElement)?.closest('button,input,a,textarea'))return;dragReady=false;draggedId=item.id;downX=ev.clientX;downY=ev.clientY;clearTimeout(dragTimer);dragTimer=setTimeout(()=>{dragReady=true;document.body.style.cursor='grabbing'},380)}
function dragMove(ev:PointerEvent){if(!draggedId)return;if(!dragReady){if(Math.hypot(ev.clientX-downX,ev.clientY-downY)>10){clearTimeout(dragTimer);draggedId=''}return}ev.preventDefault()}
function dragEnd(ev:PointerEvent){clearTimeout(dragTimer);document.body.style.cursor='';if(dragReady){const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('[data-item-id]');const b=target?.getAttribute('data-item-id');if(b)moveItem(draggedId,b)}draggedId='';dragReady=false}
onMounted(()=>{window.addEventListener('pointermove',dragMove,{passive:false});window.addEventListener('pointerup',dragEnd);window.addEventListener('pointercancel',dragEnd);const p=embeddedPackage();lockMode.value=p?'unlock':'create';applyLook();})
onBeforeUnmount(()=>{window.removeEventListener('pointermove',dragMove);window.removeEventListener('pointerup',dragEnd);window.removeEventListener('pointercancel',dragEnd);clearTimeout(saveTimer);clearTimeout(draftTimer)})
function parseRaw(text:string):Package{let obj:any;if(/^\s*<(!doctype|html)/i.test(text)){const doc=new DOMParser().parseFromString(text,'text/html');const script=doc.getElementById('foldmemo-embedded')||doc.getElementById('embeddedVault');if(!script)throw Error('不是 FoldMemo 数据文件');obj=JSON.parse(script.textContent||'null')}else obj=JSON.parse(text);if(!obj||!(obj.format==='foldmemo-vue-package-1'||isLegacy(obj)))throw Error('无法识别文件格式；导入不会修改当前保险库');return obj}
async function selectedImport(ev:Event){const f=(ev.target as HTMLInputElement).files?.[0];if(!f)return;importPackage.value=parseRaw(await f.text());importPass.value='';importOpenPass.value='';importPrompt.value=true;(ev.target as HTMLInputElement).value=''}
async function finishImport(){if(!importPackage.value)throw Error('未选择导入文件');const v=isLegacy(importPackage.value)?await decodeLegacy(importPackage.value,importPass.value):await unpack(importPackage.value,importPackage.value.encrypted?importPass.value:null);if(!confirm(`将载入 ${v.items.length} 条记录。请先备份当前保险库，确定替换当前工作区数据吗？`))return;if(v.security.openEnabled && importOpenPass.value.length<8)throw Error('请为导入后的 HTML 设置不少于 8 位的新打开密码');vault.value=v;openPassword.value=v.security.openEnabled?importOpenPass.value:'';lockMode.value='none';importPrompt.value=false;boundHandle.value=null;mark()}
function jsonDownload(obj:unknown,name:string){download(JSON.stringify(obj,null,2),name,'application/json;charset=utf-8')}
async function doExport(){if(!vault.value)return;let pass:string|null=null;if(exportEncrypt.value){pass=exportPass.value;if(!pass||pass.length<8)throw Error('请提供至少 8 位的备份加密密码');if(vault.value.security.exportVerifier&&vault.value.security.exportSalt){const chk=await verifier(pass,vault.value.security.exportSalt);if(chk.hash!==vault.value.security.exportVerifier)throw Error('存储加密密码不正确')}}else if(!confirm('明文导出会暴露全部账号和密码。仍要导出吗？'))return;const p=await pack(vault.value,pass);jsonDownload(p,`FoldMemo-${vault.value.id.slice(0,8)}.vault.json`);exportPass.value='';exportPrompt.value=false}
function exportMarkdown(){if(!vault.value)return;let s='# FoldMemo 记录\n\n';for(const it of allItems.value){const c=groups.value.find(g=>g.id===it.categoryId);s+=`<details>\n<summary>${it.title.replaceAll('<','&lt;')}</summary>\n\n`;if(it.kind==='note')s+=`${it.body}\n\n`;else for(const f of c?.fields||[]){if(f.type==='password'&&!includeMdPasswords.value)continue;s+=`- **${f.name}**：${it.values[f.id]||''}\n`}s+='\n</details>\n\n'}if(includeMdPasswords.value&&!confirm('此 Markdown 包含明文密码，确定导出吗？'))return;download(s,'FoldMemo-notes.md','text/markdown;charset=utf-8')}
async function changePass(){if(!vault.value||!modalPassword.value)return;if(modalPassword.value==='open'){
  if(vault.value.security.openEnabled&&oldPass.value!==openPassword.value)throw Error('原打开密码不正确');if(nextPass.value&&nextPass.value.length<8)throw Error('新密码至少 8 位');vault.value.security.openEnabled=!!nextPass.value;openPassword.value=nextPass.value
}else{
  if(vault.value.security.exportVerifier&&vault.value.security.exportSalt){const p=await verifier(oldPass.value,vault.value.security.exportSalt);if(p.hash!==vault.value.security.exportVerifier)throw Error('原存储加密密码不正确')}
  if(nextPass.value&&nextPass.value.length<8)throw Error('新密码至少 8 位');vault.value.security.storageEnabled=!!nextPass.value;if(nextPass.value){const p=await verifier(nextPass.value);vault.value.security.exportSalt=p.salt;vault.value.security.exportVerifier=p.hash}else{delete vault.value.security.exportSalt;delete vault.value.security.exportVerifier}
}modalPassword.value=null;oldPass.value='';nextPass.value='';mark()}
const idbName='foldmemo-vue-file-handles';async function db():Promise<IDBDatabase>{return new Promise((res,rej)=>{const req=indexedDB.open(idbName,1);req.onupgradeneeded=()=>{req.result.createObjectStore('files')};req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})}
async function rememberHandle(h:FileSystemFileHandle){const d=await db();await new Promise<void>((res,rej)=>{const t=d.transaction('files','readwrite'),r=t.objectStore('files').put(h,location.href);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)});d.close()}
async function restoreHandle(){try{const d=await db();const h=await new Promise<FileSystemFileHandle|null>((res,rej)=>{const t=d.transaction('files','readonly'),r=t.objectStore('files').get(location.href);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)});d.close();if(h){boundHandle.value=h;savedFile.value=h.name;info('已识别文件：'+h.name+'；浏览器可能要求重新授权写入')}}catch{/* permissions not supported */}}
async function authorizeCurrent(){if(!vault.value)throw Error('请先创建保险库');if(location.protocol!=='file:'||!('showOpenFilePicker' in window))throw Error('请用 Chrome/Edge 打开本地 HTML。其他环境不能保证修改当前文件');const [h]=await window.showOpenFilePicker({types:[{description:'FoldMemo HTML',accept:{'text/html':['.html']}}]});if(h.name!==filename())throw Error('选择的文件名与当前打开的 HTML 不一致，已拒绝写入');const text=await(await h.getFile()).text();if(!text.includes('foldmemo-embedded'))throw Error('选中的文件不是当前版本的 FoldMemo');const doc=new DOMParser().parseFromString(text,'text/html');const embed=doc.getElementById('foldmemo-embedded');if(!embed)throw Error('所选文件不是 FoldMemo HTML');const body=embed.textContent?.trim();const old=body&&body!=='null'?parseRaw(text):null;if(old&&firstPack.value&&JSON.stringify(old)!==JSON.stringify(firstPack.value))throw Error('目标文件与当前加载的数据不一致，已拒绝覆盖其他保险库');if(old&&!firstPack.value)throw Error('目标文件已有数据，但当前页面来自空模板，禁止直接覆盖');if(firstPack.value&&!old)throw Error('当前页面已有保险库，目标文件却为空；可能选错同名文件，拒绝覆盖');
if((await h.requestPermission({mode:'readwrite'}))!=='granted')throw Error('未获得写入许可');boundHandle.value=h;savedFile.value=h.name;await rememberHandle(h);await writeBoundFile()}
async function writeBoundFile(){if(!vault.value||!boundHandle.value)return;const v=vault.value,rev=changes,h=boundHandle.value;const p=await pack(v,v.security.openEnabled?openPassword.value:null);const text=htmlWithVault(template,p);writeSerial=writeSerial.catch(()=>{}).then(async()=>{const state=await h.queryPermission({mode:'readwrite'});if(state!=='granted'){info('当前文件权限失效，修改仅保存在本机草稿');return}const f=await h.createWritable();try{await f.write(text);await f.close()}catch(e){await f.abort().catch(()=>{});throw e}firstPack.value=p;if(rev===changes){dirty.value=false;info(`已写入当前文件：${h.name}`)}else{info('写入过程中又有修改，继续保存较新数据');setTimeout(()=>writeBoundFile(),350)}});return writeSerial}
async function manualSync(){if(!boundHandle.value)return authorizeCurrent();const h=boundHandle.value;if((await h.requestPermission({mode:'readwrite'}))!=='granted')throw Error('浏览器拒绝重新授权');await writeBoundFile()}
const categoryView=ref<string|null>(null)
function changePage(p:Page){page.value=p;editorOpen.value=false;noteOpen.value=null}
</script>

<template>
<div v-if="lockMode!=='none'" class="overlay">
  <Card class="gate shadow-xl">
    <CardHeader><CardTitle class="text-2xl flex items-center gap-2"><Lock :size="21"/> {{lockMode==='create'?'创建 FoldMemo 保险库':'解锁 FoldMemo'}}</CardTitle><CardDescription>Vue 3 + shadcn-vue 工作台 · 数据存储与访问密码独立</CardDescription></CardHeader>
    <CardContent class="grid gap-4">
      <template v-if="lockMode==='create'">
        <div class="flex justify-between items-center"><Label>打开时需要密码</Label><Switch v-model="freshOpenEnabled" /></div>
        <div v-if="freshOpenEnabled" class="grid gap-1"><Label>打开密码（至少 8 位）</Label><Input v-model="newOpeningPass" type="password" autocomplete="new-password" /></div>
        <Separator/>
        <div class="flex justify-between items-center"><Label>启用存储备份密码</Label><Switch v-model="freshStorageEnabled" /></div>
        <div v-if="freshStorageEnabled" class="grid gap-1"><Label>存储备份密码（可与打开密码不同）</Label><Input v-model="newStoragePass" type="password" autocomplete="new-password" /></div>
        <p class="small-note">打开密码保护当前 HTML 内嵌保险库；存储密码用于加密导出备份。若关闭打开密码，当前 HTML 内数据将不加密，请慎用。</p>
        <Button :disabled="busy" @click="attempt(setup)">创建保险库</Button>
      </template>
      <template v-else>
        <div v-if="firstPack?.encrypted || fakeStored?.encrypted" class="grid gap-1"><Label>打开密码</Label><Input v-model="passphrase" type="password" autocomplete="current-password" @keydown.enter="attempt(unlock)" /></div>
        <Button :disabled="busy" @click="attempt(unlock)">解锁</Button>
      </template>
      <div class="flex justify-between gap-2"><Button variant="outline" @click="embeddedImportInput?.click()"><Upload class="mr-2" :size="15"/>手动导入保险库</Button><Badge variant="outline">v1.0.5</Badge></div>
      <p v-if="uiError" class="text-destructive text-xs">{{uiError}}</p>
    </CardContent>
  </Card>
</div>

<div v-else-if="vault" class="app-shell">
  <aside class="sidebar" :class="{collapsed:!sidebarOpen,expanded:sidebarOpen}">
    <div class="brand"><button class="brandmark" aria-label="切换侧边栏" @click="sidebarOpen=!sidebarOpen">F</button><div v-if="sidebarOpen" class="side-label min-w-0"><strong>FoldMemo</strong><div class="text-xs text-muted-foreground">VUE WORKSPACE</div></div></div>
    <nav class="sidebar-nav grid content-start gap-1">
      <button v-for="x in [{key:'home',label:'首页',icon:Home},{key:'notes',label:'笔记与记录',icon:NotebookTabs},{key:'categories',label:'分类管理',icon:Tags},{key:'settings',label:'设置',icon:Settings2}]" :key="x.key" class="side-link" :class="{active:page===x.key}" :title="x.label" @click="changePage(x.key as Page)"><component :is="x.icon" :size="18"/><span class="side-label">{{x.label}}</span></button>
    </nav>
    <div class="px-2 pb-4"><button class="side-link" title="锁定" @click="lock"><Lock :size="18"/><span class="side-label">锁定保险库</span></button></div>
  </aside>
  <section class="work">
    <!-- 简洁风：只在编辑记录时显示 Chrome 式工作标签，分类筛选永远在下方内容区。 -->
    <div v-if="appearance.style==='minimal' && editorOpen" class="toolbar-tab"><button class="editor-tab" @click="editorOpen=false">{{editorId?'编辑':'新建'}} · {{draft.title||'未命名'}} <span class="ml-3">×</span></button></div>
    <div class="content">
      <div v-if="editorOpen" class="editor-grid">
        <div class="content-top"><div><h1 class="page-title">{{editorId?'编辑':'新建'}}{{editKind==='note'?'笔记':'记录'}}</h1><p class="subhead">字段来源于分类模板，不在记录中任意添加</p></div><Button variant="outline" @click="editorOpen=false"><ArrowLeft :size="15" class="mr-2"/>返回</Button></div>
        <Card><CardContent class="grid gap-5 pt-6">
          <div class="grid gap-2"><Label>标题</Label><Input v-model="draft.title" placeholder="请输入标题" /></div>
          <div v-if="editKind==='record'" class="grid gap-2"><Label>所属分类</Label><Select v-model="draft.categoryId"><SelectTrigger><SelectValue placeholder="选择分类"/></SelectTrigger><SelectContent><SelectItem v-for="c in groups" :key="c.id" :value="c.id">{{c.name}}</SelectItem></SelectContent></Select></div>
          <div v-if="editKind==='record'" class="formgrid"><div v-for="f in activeEditorCategory?.fields||[]" :key="f.id" :class="{'full':f.type==='textarea'}" class="grid gap-2"><Label>{{f.name}}</Label><Textarea v-if="f.type==='textarea'" v-model="draft.values[f.id]"/><Input v-else v-model="draft.values[f.id]" :type="f.type==='password'?'password':'text'" :placeholder="f.type==='url'?'https://example.com':''" /></div></div>
          <div v-else class="grid gap-2"><Label>正文</Label><Textarea v-model="draft.body" class="min-h-70 leading-7" placeholder="记录你的想法……" /></div>
          <div class="flex items-center justify-between gap-3"><div class="flex gap-2 items-center"><Switch v-model="draft.favorite"/><Label>收藏</Label></div><div class="flex gap-2"><Button variant="outline" @click="editorOpen=false">取消</Button><Button @click="attempt(async()=>saveItem())"><Check :size="16" class="mr-2"/>保存</Button></div></div>
        </CardContent></Card>
      </div>
      <template v-else>
      <div v-if="page==='home'" class="section">
        <div class="content-top"><div><h1 class="page-title">工作台</h1><p class="subhead">分类、记录和笔记统计</p></div><Badge variant="secondary">{{allItems.length}} 条内容</Badge></div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3"><Card v-for="x in [{name:'账号记录',n:counts.records},{name:'长文本笔记',n:counts.notes},{name:'自定义分类',n:groups.length}]" :key="x.name" class="work-card"><CardHeader class="pb-2"><CardDescription>{{x.name}}</CardDescription><CardTitle class="text-3xl">{{x.n}}</CardTitle></CardHeader></Card></div>
        <Card class="work-card"><CardHeader><CardTitle>分类分布</CardTitle><CardDescription>点击分类跳转查看对应记录</CardDescription></CardHeader><CardContent class="grid gap-3"><div v-if="!groups.length" class="small-note">尚未添加分类。请先在「分类管理」创建字段模板。</div><button v-for="c in groups" :key="c.id" class="text-left grid gap-1" @click="filter=c.id;changePage('notes')"><div class="flex justify-between text-sm"><strong>{{c.name}}</strong><span>{{allItems.filter(i=>i.categoryId===c.id).length}}</span></div><div class="bg-muted rounded-full h-2 overflow-hidden"><div class="bg-primary h-full rounded-full" :style="{width:(100*allItems.filter(i=>i.categoryId===c.id).length/Math.max(1,allItems.length))+'%'}"></div></div></button></CardContent></Card>
      </div>
      <div v-else-if="page==='notes'" class="section">
        <div class="content-top"><div><h1 class="page-title">笔记与记录</h1><p class="subhead">收藏筛选、分类查看、点击展开、长按拖动排序</p></div><div class="toolbar"><Button v-if="groups.length" variant="outline" @click="newRecord('record')"><Plus :size="15" class="mr-1"/>记录</Button><Button @click="newRecord('note')"><Plus :size="15" class="mr-1"/>笔记</Button></div></div>
        <div class="filterbar"><Button v-for="x in [{id:'favorites',name:'★ 收藏'},{id:'all',name:'全部'},...groups.map(c=>({id:c.id,name:c.name}))]" :key="x.id" size="sm" :variant="filter===x.id?'default':'outline'" @click="filter=x.id">{{x.name}} <span class="ml-1 opacity-70">{{x.id==='all'?allItems.length:x.id==='favorites'?counts.favorites:allItems.filter(i=>i.categoryId===x.id).length}}</span></Button></div>
        <div v-if="appearance.style==='minimal'" class="toolbar-tab mb-3 rounded-lg"><Search :size="15" class="text-muted-foreground"/><Input v-model="search" class="max-w-64 bg-card" placeholder="搜索当前分类"/><span class="small-note ml-auto">筛选栏位于内容区 · 编辑时才出现顶部标签</span></div>
        <div v-else class="toolbar mb-3"><Input v-model="search" class="max-w-70" placeholder="搜索笔记和记录"/><Button size="sm" variant="ghost" @click="editAppearance('cards',appearance.cards==='cards'?'list':'cards')">{{appearance.cards==='cards'?'列表':'卡片'}}</Button></div>
        <div v-if="!displayed.length" class="p-10 border border-dashed rounded-lg text-center text-muted-foreground text-sm">当前筛选暂无记录</div>
        <div v-else-if="appearance.style==='minimal'&&appearance.cards==='cards'" class="memo-board">
          <div v-for="(column,j) in board" :key="j" class="memo-column"><div v-for="it in column" :key="it.id" :data-item-id="it.id" @pointerdown="dragStart($event,it)"><Card class="memo-note record-card cursor-pointer" @click="noteOpen=it"><CardContent class="p-4"><strong class="text-sm break-words">{{it.title}}</strong><p class="small-note mt-2 line-clamp-3">{{it.kind==='note'?it.body:groups.find(c=>c.id===it.categoryId)?.name||'记录'}}</p><div class="flex items-center justify-between mt-3 text-xs text-muted-foreground"><GripVertical :size="14"/><Star v-if="it.favorite" :size="13" class="fill-current text-primary"/></div></CardContent></Card></div></div>
        </div>
        <div v-else :class="appearance.cards==='cards'?'cards':'listview'">
          <div v-for="it in displayed" :key="it.id" :data-item-id="it.id" @pointerdown="dragStart($event,it)">
            <Card class="record-card overflow-hidden"><CardContent class="p-0"><details :open="false"><summary class="flex items-center gap-2 p-4"><GripVertical :size="16" class="text-muted-foreground"/><div class="flex-1 min-w-0"><strong class="text-sm break-words">{{it.title}}</strong><div class="small-note">{{it.kind==='note'?'笔记':groups.find(c=>c.id===it.categoryId)?.name||'记录'}}</div></div><Badge variant="outline">{{it.kind==='note'?'笔记':'记录'}}</Badge></summary><div class="p-4 border-t grid gap-2">
              <div v-if="it.kind==='note'" class="whitespace-pre-wrap break-words text-sm leading-7">{{it.body}}</div>
              <template v-else><div v-for="f in groups.find(c=>c.id===it.categoryId)?.fields||[]" :key="f.id" class="fieldline"><span class="small-note">{{f.name}}</span><div class="field-text"><template v-if="f.type==='password'">{{isVisible(it,f)?fieldValue(it,f):'••••••••'}}</template><a v-else-if="f.type==='url'&&normalizedUrl(fieldValue(it,f))" class="field-url" :href="normalizedUrl(fieldValue(it,f))||undefined" target="_blank" rel="noopener noreferrer" @click.stop>{{fieldValue(it,f)}}</a><span v-else>{{fieldValue(it,f)}}</span></div><div class="field-actions"><Button v-if="f.type==='password'" size="icon" variant="ghost" :aria-label="isVisible(it,f)?'隐藏':'显示'" @click="toggleVisible(it,f)"><EyeOff v-if="isVisible(it,f)" :size="16"/><Eye v-else :size="16"/></Button><Button v-if="f.type==='url'" size="icon" variant="ghost" title="打开网页" @click="goUrl(fieldValue(it,f))"><ExternalLink :size="16"/></Button><Button size="icon" variant="ghost" title="复制" @click="copy(fieldValue(it,f))"><Copy :size="16"/></Button></div></div></template>
              <div class="flex flex-wrap gap-2 pt-3"><Button size="sm" variant="outline" @click="editItem(it)"><Pencil :size="14" class="mr-1"/>编辑</Button><Button size="sm" variant="outline" @click="favorite(it)"><Star :size="14" class="mr-1"/>{{it.favorite?'取消收藏':'收藏'}}</Button><Button size="sm" variant="destructive" @click="deleteItem(it)"><Trash2 :size="14" class="mr-1"/>删除</Button></div>
            </div></details></CardContent></Card>
          </div>
        </div>
      </div>
      <div v-else-if="page==='categories'" class="section">
        <div class="content-top"><div><h1 class="page-title">分类管理</h1><p class="subhead">先创建字段模板，再录入账号与记录</p></div><Button @click="categoryNew"><Plus :size="15" class="mr-2"/>新建分类</Button></div>
        <div class="filterbar"><Button v-for="c in groups" :key="c.id" size="sm" :variant="categoryView===c.id?'default':'outline'" @click="categoryView=c.id">{{c.name}}</Button></div>
        <Card v-if="groups.find(c=>c.id===categoryView)||groups[0]" class="work-card"><CardHeader><CardTitle>{{(groups.find(c=>c.id===categoryView)||groups[0]).name}}</CardTitle><CardDescription>每条记录都使用该分类统一的字段模板</CardDescription></CardHeader><CardContent><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><Card v-for="f in (groups.find(c=>c.id===categoryView)||groups[0]).fields" :key="f.id"><CardContent class="p-4"><strong class="text-sm">{{f.name}}</strong><p class="small-note">{{f.type}}</p></CardContent></Card></div><div class="flex gap-2 mt-5"><Button variant="outline" @click="categoryEdit(groups.find(c=>c.id===categoryView)||groups[0])">编辑模板</Button><Button variant="destructive" @click="removeCategory(groups.find(c=>c.id===categoryView)||groups[0])">删除</Button></div></CardContent></Card>
        <div v-else class="text-muted-foreground text-sm">尚无分类</div>
      </div>
      <div v-else-if="page==='settings'" class="section">
        <div class="content-top"><div><h1 class="page-title">设置</h1><p class="subhead">全局主题、独立密码、当前文件与导出</p></div></div>
        <Card class="work-card"><CardHeader><CardTitle>系统外观</CardTitle></CardHeader><CardContent class="grid gap-4">
          <div class="setting-line"><div><strong>主题样式</strong><p class="small-note">现代风使用真实 shadcn-vue 组件</p></div><Select :model-value="appearance.style" @update:model-value="v=>editAppearance('style',v as Vault['appearance']['style'])"><SelectTrigger class="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">默认风格</SelectItem><SelectItem value="minimal">简洁风</SelectItem><SelectItem value="modern">现代风</SelectItem></SelectContent></Select></div>
          <div class="setting-line"><div><strong>内容布局</strong><p class="small-note">列表或卡片，两种视图均可使用</p></div><Select :model-value="appearance.cards" @update:model-value="v=>editAppearance('cards',v as Vault['appearance']['cards'])"><SelectTrigger class="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cards">卡片</SelectItem><SelectItem value="list">列表</SelectItem></SelectContent></Select></div>
          <div class="setting-line"><div><strong>日间 / 夜间</strong><p class="small-note">包含跟随系统选项</p></div><Select :model-value="appearance.mode" @update:model-value="v=>editAppearance('mode',v as Vault['appearance']['mode'])"><SelectTrigger class="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="light">日间</SelectItem><SelectItem value="dark">夜间</SelectItem><SelectItem value="system">跟随系统</SelectItem></SelectContent></Select></div>
          <div class="setting-line"><div><strong>全局主题色</strong><p class="small-note">同步改变背景、侧栏、卡片、按钮、焦点与提示色</p></div><div class="pill-swatches"><button v-for="x in [{id:'violet',color:'#6957ed'},{id:'blue',color:'#277cdc'},{id:'green',color:'#159f74'},{id:'rose',color:'#dc5387'}]" :key="x.id" class="swatch" :class="{active:appearance.accent===x.id}" :style="{background:x.color}" @click="editAppearance('accent',x.id as Vault['appearance']['accent'])"></button></div></div>
          <div class="setting-line"><div><strong>界面语言</strong></div><Select :model-value="appearance.language" @update:model-value="v=>editAppearance('language',v as 'zh'|'en')"><SelectTrigger class="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="zh">中文</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></div>
        </CardContent></Card>
        <Card class="work-card"><CardHeader><CardTitle>独立密码管理</CardTitle><CardDescription>两套密码互不依赖。修改其中一个无需修改另一个。</CardDescription></CardHeader><CardContent class="grid gap-3"><div class="setting-line"><div><strong>打开密码</strong><p class="small-note">用于本设备打开 HTML 内嵌保险库；关闭后当前 HTML 内数据为明文</p></div><Button variant="outline" @click="modalPassword='open'">{{hasOpenPassword?'修改 / 关闭':'设置打开密码'}}</Button></div><div class="setting-line"><div><strong>存储加密密码</strong><p class="small-note">用于导出加密备份，不会在每次打开时索取</p></div><Button variant="outline" @click="modalPassword='storage'">修改 / 关闭</Button></div></CardContent></Card>
        <Card class="work-card"><CardHeader><CardTitle>当前 HTML 文件</CardTitle><CardDescription>不会悄悄创建第二份数据文件</CardDescription></CardHeader><CardContent class="grid gap-3"><p class="small-note">当前文件：{{filename()}}。浏览器通常无法获知文件选择器的完整磁盘路径。</p><p class="small-note">{{savedFile?'已绑定：'+savedFile:'尚未授权当前文件写入。浏览器草稿不是 HTML 文件本身。'}}</p><Button class="w-fit" variant="outline" @click="attempt(manualSync)"><Save class="mr-2" :size="16"/>{{savedFile?'同步当前 HTML':'首次授权当前 HTML 写入'}}</Button><p class="text-xs text-destructive">如果没有授权写入，请勿直接复制旧 HTML 作为最新备份。</p></CardContent></Card>
        <Card class="work-card"><CardHeader><CardTitle>导出保险库</CardTitle><CardDescription>点击后选择加密或明文；加密时默认验证存储密码</CardDescription></CardHeader><CardContent><Button variant="outline" @click="exportPrompt=true"><FileDown :size="16" class="mr-2"/>导出保险库 JSON</Button></CardContent></Card>
        <Card class="work-card"><CardHeader><CardTitle>导出折叠 Markdown</CardTitle><CardDescription>Markdown 是可读取的明文格式，请谨慎包含密码</CardDescription></CardHeader><CardContent class="flex flex-wrap gap-3 items-center"><div class="flex gap-2 items-center"><Switch v-model="includeMdPasswords"/><Label>包含密码字段</Label></div><Button variant="outline" @click="exportMarkdown"><Download :size="16" class="mr-2"/>导出 MD</Button></CardContent></Card>
        <div class="flex gap-2"><Button variant="outline" @click="importInput?.click()"><Upload :size="16" class="mr-2"/>手动导入</Button><Button variant="destructive" @click="lock"><Lock :size="16" class="mr-2"/>锁定</Button></div>
      </div>
      </template>
    </div>
  </section>
  <div class="status" role="status">{{status||'FoldMemo Vue 3 · 请确认文件保存状态'}}</div>
</div>

<!-- 笔记完整阅读页 -->
<Dialog :open="!!noteOpen" @update:open="v=>{if(!v)noteOpen=null}"><DialogContent class="max-w-3xl max-h-[88dvh] overflow-auto"><DialogHeader><DialogTitle>{{noteOpen?.title}}</DialogTitle><DialogDescription>{{noteOpen?.kind==='note'?'长文本笔记':'账号记录'}}</DialogDescription></DialogHeader><div v-if="noteOpen" class="grid gap-4"><div v-if="noteOpen.kind==='note'" class="whitespace-pre-wrap leading-8 break-words">{{noteOpen.body}}</div><div v-else v-for="f in groups.find(c=>c.id===noteOpen?.categoryId)?.fields||[]" :key="f.id" class="fieldline"><span>{{f.name}}</span><div class="field-text">{{f.type==='password'&&!isVisible(noteOpen,f)?'••••••••':fieldValue(noteOpen,f)}}</div><div class="field-actions"><Button v-if="f.type==='password'" variant="ghost" size="icon" @click="toggleVisible(noteOpen,f)"><Eye :size="16"/></Button><Button v-if="f.type==='url'" variant="ghost" size="icon" @click="goUrl(fieldValue(noteOpen,f))"><ExternalLink :size="16"/></Button><Button variant="ghost" size="icon" @click="copy(fieldValue(noteOpen,f))"><Copy :size="16"/></Button></div></div><DialogFooter><Button variant="outline" @click="noteOpen=null">关闭</Button><Button @click="noteOpen&&editItem(noteOpen)">编辑</Button></DialogFooter></div></DialogContent></Dialog>

<!-- 编辑分类的弹窗使用真实 shadcn-vue Dialog -->
<Dialog v-model:open="categoryDialog"><DialogContent class="max-w-xl max-h-[88dvh] overflow-auto"><DialogHeader><DialogTitle>{{categoryId?'编辑分类':'新建分类'}}</DialogTitle><DialogDescription>模板字段在记录中只允许填写，不允许增加</DialogDescription></DialogHeader><div class="grid gap-4 py-2"><div class="grid gap-2"><Label>分类名称</Label><Input v-model="categoryName"/></div><div class="grid gap-2"><Label>已有字段</Label><div v-for="(f,i) in categoryFields" :key="f.id" class="flex gap-2 items-center"><Input v-model="f.name" class="flex-1"/><Badge variant="secondary">{{f.type}}</Badge><Button size="icon" variant="outline" @click="categoryFields.splice(i,1)"><Trash2 :size="15"/></Button></div></div><Separator/><div class="grid sm:grid-cols-[1fr_150px_auto] gap-2"><Input v-model="fieldName" placeholder="字段名称"/><Select v-model="fieldType"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="text">普通文本</SelectItem><SelectItem value="password">密码</SelectItem><SelectItem value="url">网址</SelectItem><SelectItem value="textarea">长文本</SelectItem></SelectContent></Select><Button variant="outline" @click="addField">添加字段</Button></div></div><DialogFooter><Button variant="outline" @click="categoryDialog=false">取消</Button><Button @click="attempt(async()=>saveCategory())">保存分类</Button></DialogFooter></DialogContent></Dialog>

<Dialog :open="modalPassword!==null" @update:open="v=>{if(!v)modalPassword=null}"><DialogContent><DialogHeader><DialogTitle>{{modalPassword==='open'?'修改打开密码':'修改存储加密密码'}}</DialogTitle><DialogDescription>清空新密码表示关闭这一密码要求，不影响另一项</DialogDescription></DialogHeader><div class="grid gap-3"><Label>原密码（首次设置留空）</Label><Input v-model="oldPass" type="password"/><Label>新密码（至少 8 位；留空关闭）</Label><Input v-model="nextPass" type="password"/></div><DialogFooter><Button variant="outline" @click="modalPassword=null">取消</Button><Button @click="attempt(changePass)">确认更改</Button></DialogFooter></DialogContent></Dialog>

<Dialog v-model:open="importPrompt"><DialogContent class="z-[130]"><DialogHeader><DialogTitle>导入保险库</DialogTitle><DialogDescription>手动导入并确认后才会替换当前内容</DialogDescription></DialogHeader><div v-if="importPackage?.encrypted || isLegacy(importPackage) || (importPackage?.security?.openEnabled)" class="grid gap-2"><Label>文件解密密码</Label><Input v-model="importPass" type="password"/></div><div class="grid gap-2"><Label>导入后使用的打开密码（若保险库启用了打开密码）</Label><Input v-model="importOpenPass" type="password" autocomplete="new-password"/></div><DialogFooter><Button variant="outline" @click="importPrompt=false">取消</Button><Button @click="attempt(finishImport)">验证并导入</Button></DialogFooter></DialogContent></Dialog>
<Dialog v-model:open="exportPrompt"><DialogContent><DialogHeader><DialogTitle>导出保险库</DialogTitle><DialogDescription>加密导出默认使用存储密码，明文导出前需要二次确认</DialogDescription></DialogHeader><div class="grid gap-3"><div class="flex justify-between items-center"><Label>启用 AES-256-GCM 加密</Label><Switch v-model="exportEncrypt"/></div><div v-if="exportEncrypt" class="grid gap-2"><Label>存储密码 / 临时备份密码</Label><Input v-model="exportPass" type="password"/></div></div><DialogFooter><Button variant="outline" @click="exportPrompt=false">取消</Button><Button @click="attempt(doExport)">导出</Button></DialogFooter></DialogContent></Dialog>
<input ref="importInput" type="file" hidden accept=".json,.html" @change="selectedImport"/>
<input ref="embeddedImportInput" type="file" hidden accept=".json,.html" @change="selectedImport"/>
<div v-if="uiError && lockMode==='none'" class="fixed bottom-12 right-4 z-[110] max-w-sm rounded-lg bg-destructive text-white p-3 shadow-lg text-xs"><button class="mr-2" @click="uiError=''">×</button>{{uiError}}</div>
</template>
