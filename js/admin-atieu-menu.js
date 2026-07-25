document.addEventListener('DOMContentLoaded', function() {
  var FB = firebase.database().ref('atieu/menu/items');
  var CATEGORIES = {main:'Món chính',appetizer:'Khai vị',soup:'Súp - Canh',drink:'Nước uống',combo:'Combo'};

  function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c];}); }

  function load() {
    FB.on('value', function(snap) {
      var data = snap.val();
      var tbody = document.getElementById('amTableBody');
      var empty = document.getElementById('amEmpty');
      tbody.innerHTML = '';
      if (!data) { empty.style.display = 'block'; return; }
      empty.style.display = 'none';
      Object.keys(data).forEach(function(k) {
        var item = data[k];
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>'+escapeHtml(item.name)+'</td>' +
          '<td>'+(CATEGORIES[item.category]||item.category)+'</td>' +
          '<td>'+escapeHtml(String(item.price))+'đ</td>' +
          '<td>'+escapeHtml(item.desc||'')+'</td>' +
          '<td><button class="btn-danger am-delete" data-key="'+k+'">Xóa</button></td>';
        tbody.appendChild(tr);
      });
      document.querySelectorAll('.am-delete').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (confirm('Xóa món này?')) {
            FB.child(this.dataset.key).remove();
          }
        });
      });
    });
  }

  document.getElementById('amAddBtn').addEventListener('click', function() {
    var name = document.getElementById('amName').value.trim();
    var price = document.getElementById('amPrice').value.trim();
    var category = document.getElementById('amCategory').value;
    var desc = document.getElementById('amDesc').value.trim();
    if (!name || !price) { alert('Nhập tên và giá món.'); return; }
    FB.push({name:name, price:parseInt(price), category:category, desc:desc});
    document.getElementById('amName').value = '';
    document.getElementById('amPrice').value = '';
    document.getElementById('amDesc').value = '';
  });
  load();
});
