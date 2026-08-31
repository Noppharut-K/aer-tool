/**
 * standards.js — per-module display config
 *
 * No preset threshold values live here — the Standards Library is 100%
 * user-entered (spec: "เป็นการกรอกด้วยมือทั้งหมด ไม่มีระบบดึงข้อมูลอัตโนมัติ").
 * This file only carries each module's name and accent-color identity.
 */

export const TYPE_CFG = {
  sea: { name: 'Seawater',  accent: 'sea', hasDepth: true },
  sed: { name: 'Sediment',  accent: 'sed', hasDepth: false },
};
