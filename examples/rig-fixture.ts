/** Small authored hierarchy so the example works without downloaded assets. */
import type { RigDefinition } from "shooosh/rig"
export const demoRig: RigDefinition = {
  version: 1,
  nodes: [
    { key: "root", name: "Root", translation: [0, -1.2, 0] },
    { key: "shoulder", name: "Shoulder", parent: 0, translation: [0, 1.2, 0] },
    { key: "elbow", name: "Elbow", parent: 1, translation: [0, 0.9, 0] },
    { key: "hand", name: "Hand", parent: 2, translation: [0, 0.8, 0] },
    { key: "finger", name: "Finger", parent: 3, translation: [0, 0.35, 0] },
  ],
  clips: [
    {
      name: "Wave",
      tracks: [
        {
          node: 1,
          path: "rotation",
          times: [0, 1, 2],
          values: [0, 0, -0.3, 0.954, 0, 0, 0.3, 0.954, 0, 0, -0.3, 0.954],
        },
        {
          node: 2,
          path: "rotation",
          times: [0, 0.5, 1, 1.5, 2],
          values: [
            0, 0, -0.5, 0.866, 0, 0, -0.15, 0.989, 0, 0, -0.5, 0.866, 0, 0, -0.15, 0.989,
            0, 0, -0.5, 0.866,
          ],
        },
      ],
    },
  ],
}
