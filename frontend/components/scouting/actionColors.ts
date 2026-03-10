import { RobotAction } from '@/types/scouting';
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '@/tailwind.config';

const fullConfig = resolveConfig(tailwindConfig);
const colors = fullConfig.theme?.colors as any;

export interface ActionColor {
  bg: string;
  text: string;
  tw: string;
}

export const ACTION_COLORS: Record<RobotAction, ActionColor> = {
  traversing: {
    bg: colors.slate[500],
    text: colors.slate[900],
    tw: 'bg-slate-500',
  },
  shooting: {
    bg: colors.emerald[500],
    text: colors.white,
    tw: 'bg-emerald-500',
  },
  defending: {
    bg: colors.amber[500],
    text: colors.white,
    tw: 'bg-amber-500',
  },
  intake: {
    bg: colors.purple[500],
    text: colors.white,
    tw: 'bg-purple-500',
  },
  outtake: {
    bg: colors.pink[500],
    text: colors.white,
    tw: 'bg-pink-500',
  },
  herding: {
    bg: colors.orange[500],
    text: colors.white,
    tw: 'bg-orange-500',
  },
  disabled: {
    bg: colors.red[500],
    text: colors.white,
    tw: 'bg-red-500',
  },
  climbing: {
    bg: colors.blue[500],
    text: colors.white,
    tw: 'bg-blue-500',
  },
};

export const ACTION_LABELS: Record<RobotAction, string> = {
  traversing: 'Traversing',
  shooting: 'Shooting',
  defending: 'Defending',
  intake: 'Intake',
  outtake: 'Outtake',
  herding: 'Herding',
  disabled: 'Disabled',
  climbing: 'Climbing',
};
