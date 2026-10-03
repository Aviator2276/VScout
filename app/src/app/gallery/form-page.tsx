// The active season's match form, rendered from its descriptors (BETA content), for either level.
import { useState } from "react"
import { Segmented } from "@/components/controls/segmented"
import { activeGame } from "@/config/game"
import { ScoutingFormView } from "@/features/scouting/components/scouting-form-view"
import { useScoutingForm } from "@/features/scouting/hooks/use-scouting-form"
import type { ScouterLevel } from "@/games/types"
import { uuidIds } from "@/lib/ids"

export function FormPage() {
  const [level, setLevel] = useState<ScouterLevel>("new")
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Segmented
        label="Scouter level"
        options={[
          { value: "new", label: "New" },
          { value: "experienced", label: "Experienced" },
        ]}
        value={level}
        onValueChange={setLevel}
      />
      {/* a new form per level: TanStack Form keeps its own state */}
      <MatchForm key={level} level={level} />
    </div>
  )
}

function MatchForm({ level }: { level: ScouterLevel }) {
  const formDef = activeGame.matchForm
  const [ctx] = useState({ level, stage: "qual" } as const)
  const form = useScoutingForm({ game: activeGame, form: formDef, ctx })
  const [stage, setStage] = useState(formDef.sections[0]?.id ?? "")
  return (
    <ScoutingFormView
      env={{ game: activeGame, level, alliance: "red", ids: uuidIds }}
      formDef={formDef}
      ctx={ctx}
      form={form}
      stage={stage}
      onStageChange={setStage}
    />
  )
}
