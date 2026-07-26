/**
 * js/business-members.js — Multi-Tenant Authentication (Option B).
 * Cấu trúc: businessMembers/{businessId}/{uid} = { role, email, name, assignedAt }
 * roles/{uid} giữ nguyên cho PShop Music (legacy).
 */
const BusinessMembers = (function() {
  'use strict';
  var NODE = 'businessMembers';

  function getRef(businessId, uid) {
    var ref = firebase.database().ref(NODE);
    if (businessId) ref = ref.child(businessId);
    if (uid) ref = ref.child(uid);
    return ref;
  }

  function getMember(businessId, uid) {
    return getRef(businessId, uid).once('value').then(function(s) { return s.val(); });
  }

  function getMembers(businessId) {
    return getRef(businessId).once('value').then(function(s) {
      var d = s.val();
      return d ? Object.keys(d).map(function(k) { return Object.assign({ uid: k }, d[k]); }) : [];
    });
  }

  function setMember(businessId, uid, data) {
    return getRef(businessId, uid).set(Object.assign({
      assignedAt: firebase.database.ServerValue.TIMESTAMP
    }, data));
  }

  function removeMember(businessId, uid) {
    return getRef(businessId, uid).remove();
  }

  function getUserBusinesses(uid) {
    return firebase.database().ref(NODE).once('value').then(function(s) {
      var businesses = [];
      var all = s.val();
      if (!all) return businesses;
      Object.keys(all).forEach(function(bid) {
        if (all[bid] && all[bid][uid]) {
          businesses.push({ businessId: bid, role: all[bid][uid].role });
        }
      });
      return businesses;
    });
  }

  return { getMember: getMember, getMembers: getMembers, setMember: setMember, removeMember: removeMember, getUserBusinesses: getUserBusinesses };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = BusinessMembers; }
