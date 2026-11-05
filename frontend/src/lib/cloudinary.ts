export function cloudinaryAttachmentUrl(url: string, fileName?: string | null): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url

  const sourceName = fileName || url.split('/').pop()?.split('?')[0] || 'documento'
  const safeName = sourceName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_') || 'download'

  return url.replace(/\/upload\/(v\d+\/)?/, (_match, version = '') => `/upload/fl_attachment:${safeName}/${version}`)
}