(function(){'use strict';
const $=(s)=>document.querySelector(s);
function ready(){
 const toggle=$('#mobile-menu-toggle'), nav=$('#main-nav-links'); if(toggle&&nav) toggle.addEventListener('click',()=>nav.classList.toggle('open'));
 document.querySelectorAll('#main-nav-links a').forEach(a=>a.addEventListener('click',()=>nav&&nav.classList.remove('open')));
 const upload=$('#game-upload'), status=$('#upload-status'); if(upload&&status) upload.addEventListener('change',()=>{const f=upload.files&&upload.files[0]; if(!f){status.textContent='No file selected.';return} const mb=(f.size/1048576).toFixed(2); const ok=/\.(zip|html?)$/i.test(f.name); status.textContent=ok?`${f.name} selected (${mb} MB). Basic package check ready.`:`Unsupported file type: ${f.name}. Choose a ZIP or HTML file.`; status.style.color=ok?'#67e8f9':'#fda4af';});
 const hash=location.hash; if(hash==='#login'){const m=$('#login-modal'); if(m){m.classList.add('active');m.style.display='flex'}}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
