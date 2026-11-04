(function(root) {
  const helpers = {
    escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    },
    csvCell(value) {
      if(typeof value === 'number' && Number.isFinite(value)) return String(value);
      let text=String(value ?? '');
      if(/^[\s]*[=+\-@\t\r\n]/.test(text)) text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    },
    dateKey(value = new Date()) {
      if(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const date=new Date(value);
      if(Number.isNaN(date.getTime())) return '';
      return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    }
  };
  if(typeof module!=='undefined' && module.exports) module.exports=helpers;
  else root.AureaSafe=helpers;
})(typeof window!=='undefined'?window:globalThis);
