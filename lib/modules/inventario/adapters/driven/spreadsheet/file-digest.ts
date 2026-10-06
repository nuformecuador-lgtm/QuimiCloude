import { createHash } from 'node:crypto';

import type { FileDigest } from '../../../ports/file-digest';

export const fileDigest: FileDigest = {
  async sha256Hex(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
  },
};
