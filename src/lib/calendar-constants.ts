// Définition des créneaux horaires partagée entre les composants
export const TIME_SLOTS = [
  { id: 1, label: "Matin", time: "6h-12h", icon: "🌅" },
  { id: 2, label: "Midi", time: "12h-14h", icon: "☀️" },
  { id: 3, label: "Après-midi", time: "14h-18h", icon: "🌤️" },
  { id: 4, label: "Soir", time: "18h-22h", icon: "🌙" },
] as const;

export type TimeSlot = typeof TIME_SLOTS[number];
export type TimeSlotId = TimeSlot["id"];

export const getSlotLabel = (slotId: number) => {
  const slot = TIME_SLOTS.find(s => s.id === slotId);
  return slot ? `${slot.icon} ${slot.label} (${slot.time})` : `Créneau ${slotId}`;
};

export const getSlotShortLabel = (slotId: number) => {
  const slot = TIME_SLOTS.find(s => s.id === slotId);
  return slot ? `${slot.icon} ${slot.label}` : `Créneau ${slotId}`;
};
