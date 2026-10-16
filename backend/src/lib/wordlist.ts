// 2048 short, common English words (BIP-39 list): 3 words ≈ 33 bits, plus 2 digits ≈ 40 bits.
import { wordlist } from "@scure/bip39/wordlists/english.js"

export const WORDS: readonly string[] = wordlist
