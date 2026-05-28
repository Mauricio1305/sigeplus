/**
 * Transforma URLs de compartilhamento do Google Drive e Dropbox em links diretos para exibição
 * @param url URL original de compartilhamento
 * @returns URL transformada para uso em tags <img>
 */
export const getDirectImageUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('data:image')) return url; // Já é um data URL (base64)
  
  try {
    // Google Drive
    if (url.includes('drive.google.com')) {
      const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        const id = idMatch[1];
        // O endpoint /thumbnail é o mais confiável para embutir imagens públicas do Drive
        // sem ser barrado por avisos de antivírus ou tamanho de arquivo.
        return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
      }
    }
    
    // Dropbox
    if (url.includes('dropbox.com')) {
      // Dropbox suporta link direto apenas trocando o parâmetro dl=0 por raw=1
      return url.replace('?dl=0', '?raw=1').replace('&dl=0', '&raw=1');
    }
    
    return url;
  } catch (e) {
    console.error('Erro ao processar URL da imagem:', e);
    return url;
  }
};
