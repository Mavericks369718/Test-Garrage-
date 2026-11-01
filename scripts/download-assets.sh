#!/usr/bin/env bash
# Downloads ONLY the SimReady GLB subsets Torque House uses (never the full 3.2 GB).
# Source: codepawl/simready-glb (CC BY 4.0, NVIDIA). Do NOT use imagineio/PhysicalAI-SimReady-Assets (CC BY-NC).
set -euo pipefail
command -v hf >/dev/null || pip install -U huggingface_hub
hf download codepawl/simready-glb --repo-type dataset --local-dir raw \
  --include "glb/bodyPart_*" "glb/engineAssembly_*" "glb/engineComponent_*" \
  "glb/wheelAssembly_*" "glb/suspension_*" "glb/brakeSystem_*" "glb/exhaustSystem_*" \
  "glb/drivetrain_*" "glb/steeringSystem_*" "glb/interiorPart_*" "glb/carFrame_*" \
  "glb/vehicleSupport_*" "glb/serviceTool_*" "glb/tireTool_*" "glb/powerTool_*" \
  "glb/structure_*" "glb/lighting_*" "glb/storage_*" "glb/rack_*" "glb/pallet_*" \
  "glb/drum_*" "glb/paint_*" "glb/barrier_*" "glb/fireExtinguisher_*" "glb/ladder_*" \
  "glb/handTruck_*" "glb/handTool_*" "glb/sign_warning_*" "glb/sign_wetFloor_*" \
  "glb/warehouse_*" "glb/monitor_*" "glb/computer_*" \
  "manifest.jsonl" "thumbs/*"
echo "Done. Now run: npm run assets:build"
