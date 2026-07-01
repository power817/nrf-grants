/*
 * Google AdSense 연동.
 * 승인 후 아래 client / slots 값만 채우면 광고가 자동으로 켜집니다.
 * 값이 비어 있으면 아무 코드도 실행되지 않아 빈 박스·오류가 생기지 않습니다.
 *
 *  1) client : AdSense 게시자 ID (예: 'ca-pub-1234567890123456')
 *  2) slots  : 광고 단위(슬롯) ID  (AdSense > 광고 > 광고 단위별)
 *  3) web/ads.txt 의 pub-XXXX 도 같은 번호로 교체
 */
window.ADSENSE = {
  client: '', // 예: 'ca-pub-1234567890123456'
  slots: {
    top: '',    // 결과 상단 배너 슬롯 ID
    bottom: '', // 결과 하단 배너 슬롯 ID
  },
};

(function () {
  var cfg = window.ADSENSE;
  if (!cfg || !cfg.client) return; // 미설정 → 비활성화

  // AdSense 로더 삽입
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.client);
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);

  function mountAd(container, slot) {
    if (!container || !slot) return;
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', cfg.client);
    ins.setAttribute('data-ad-slot', slot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    container.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* noop */ }
    container.hidden = false;
  }

  window.addEventListener('DOMContentLoaded', function () {
    mountAd(document.querySelector('[data-ad="top"]'), cfg.slots.top);
    mountAd(document.querySelector('[data-ad="bottom"]'), cfg.slots.bottom);
  });
})();
