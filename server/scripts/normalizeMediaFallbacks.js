require('dotenv').config();
const { testConnection, query } = require('../config/database');

(async () => {
  console.log('🔄 Iniciando normalização global de mídia (áudio/vídeo)');
  try {
    await testConnection();

    // 1) Remover áudio frontal quando houver vídeo frontal
    const clearFrontAudio = await query(
      `UPDATE cards
       SET front_audio_url = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE front_video_url IS NOT NULL
         AND front_audio_url IS NOT NULL`
    );
    const clearedCount = clearFrontAudio?.changes || 0;
    console.log(`🧹 Áudio frontal removido em cartões com vídeo frontal: ${clearedCount}`);

    // 2) Aplicar fallback: se não há vídeo na frente, 
    //    e o áudio frontal está ausente, usar o áudio do verso
    const applyFallback = await query(
      `UPDATE cards
       SET front_audio_url = back_audio_url,
           updated_at = CURRENT_TIMESTAMP
       WHERE front_audio_url IS NULL
         AND front_video_url IS NULL
         AND back_audio_url IS NOT NULL`
    );
    const appliedCount = applyFallback?.changes || 0;
    console.log(`✅ Fallback de áudio aplicado (frente ← verso): ${appliedCount}`);

    console.log('🎉 Normalização de mídia concluída com sucesso.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Falha na normalização de mídia:', err?.message || err);
    process.exit(1);
  }
})();