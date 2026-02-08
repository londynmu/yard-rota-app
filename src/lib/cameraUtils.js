export const dataUrlToFile = (dataUrl, filename = 'photo.jpg') => {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;

  const header = parts[0];
  const base64 = parts[1];
  const mimeMatch = header.match(/data:(.*?);base64/i);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], filename, { type: mime, lastModified: Date.now() });
  } catch {
    return null;
  }
};

export const blobToFile = (blob, filename = 'photo.jpg') => {
  if (!(blob instanceof Blob)) return null;
  const type = blob.type || 'image/jpeg';
  return new File([blob], filename, { type, lastModified: Date.now() });
};
