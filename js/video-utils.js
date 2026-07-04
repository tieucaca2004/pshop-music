/*
 * Shared YouTube/Vimeo URL parsing — used by both the Video Manager admin
 * form (preview + validation) and the public video gallery (embed + lazy
 * thumbnail so we don't load N iframes upfront).
 */
function parseVideoUrl(url) {
  url = (url || '').trim();
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/);
  if (m) {
    const id = m[1];
    return { platform: 'youtube', embedUrl: 'https://www.youtube.com/embed/' + id + '?autoplay=1', thumbnail: 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg' };
  }
  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) {
    const id = m[1];
    return { platform: 'vimeo', embedUrl: 'https://player.vimeo.com/video/' + id + '?autoplay=1', thumbnail: '' };
  }
  return null;
}
