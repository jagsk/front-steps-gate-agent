"use client";

import SettingsForm from "@/components/SettingsForm";

export default function SettingsPage() {
  return <SettingsForm onBack={() => { window.location.href = "/"; }} />;
}
