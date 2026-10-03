import multer from 'multer';
import { config } from '../config';

/** Файлы принимаются в память, затем сохраняются через FileStorage */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 10 },
});
