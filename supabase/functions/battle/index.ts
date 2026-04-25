import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATTLE_SYSTEM = `You are an imaginative combat narrator. Write vivid, engaging battles that are coherent and satisfying.

Rules:
- The context is a brutal tournament hosted by a mysterious overseer called "The Game Master." The Game Master is a cunning figure who watches, but does not commentate. He isn't malicious but just sees the world as a game, and treats others like characters in the game.
- The two fighters are forced to battle to the death, no matter their prior relationship, loyalties, or morals. The characters are going to be revived and forced to fight again if killed, they are all aware of this. So killing isn't as bad as it usually is with that knowledge. They are on a fitting, but equal battlefield. It may fit one character, or both in a mishmash.
- Use the given character descriptions to infer abilities, fighting style, weaknesses, and personality.
- DO NOT copy long phrases or sentences from the descriptions verbatim unless they fit naturally; rephrase and adapt instead. Don't use direct quotes from the description if possible.
- Make the battle tactical and character-driven. Show how their personalities affect their choices, including any reluctance or conflict, but they must ultimately fight to the end.
- Keep the tone cinematic but grounded; avoid fourth wall breaks.
- Clearly describe who wins by the end, making it clear that the loser does not survive.
- Length: between 5 and 20 paragraphs. A paragraph is 2-6 sentences.
- After the final paragraph, output a single separate line exactly in the format: "WINNER:[name]" where [name] is the winner's name, with no extra words before or after.`;

const EXPLAIN_SYSTEM = `You are an analytical combat commentator. Explain and justify battle results clearly.

Rules:
- You are given a previously written battle story and the declared winner.
- Do NOT rewrite the whole story; instead, analyze it.
- Explain why key moments in the fight unfolded as they did, based on abilities and personalities.
- Justify why the winner was the most plausible victor.
- If there were turning points, highlight them.
- Length: 3-8 paragraphs, 2-5 sentences each.
- Write directly to the reader, but do not break the fourth wall beyond normal explanation tone.`;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode } = body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let messages;
    if (mode === "battle") {
      const { a, b, extraContext } = body;
      const userPrompt =
        `Simulate a battle between these two characters.\n\n` +
        `Character A: ${a.name}\nDescription A:\n${a.description}\n\n` +
        `Character B: ${b.name}\nDescription B:\n${b.description}\n\n` +
        (extraContext
          ? `Additional context and instructions for this specific battle:\n${extraContext}\n\n`
          : "") +
        `They have been pulled into a ruthless tournament run by an enigmatic figure known only as "The Game Master." In this arena, they are compelled to fight to the death regardless of their personal relationship, history, or morals. Decide who would most plausibly win, based on their abilities, mindset, and how the fight unfolds. Make sure the ending feels decisive, earned, and leaves no doubt that only one of them walks away alive.`;
      messages = [
        { role: "system", content: BATTLE_SYSTEM },
        { role: "user", content: userPrompt },
      ];
    } else if (mode === "explain") {
      const { a, b, story, winnerName } = body;
      const userPrompt =
        `You previously narrated a battle.\n\n` +
        `Character A: ${a.name}\nDescription A:\n${a.description}\n\n` +
        `Character B: ${b.name}\nDescription B:\n${b.description}\n\n` +
        `Winner: ${winnerName || "Unknown"}\n\n` +
        `Battle story:\n${story}\n\n` +
        `Explain the logic behind how the fight played out and why this winner makes sense.`;
      messages = [
        { role: "system", content: EXPLAIN_SYSTEM },
        { role: "user", content: userPrompt },
      ];
    } else {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages,
        }),
      }
    );

    if (!resp.ok) {
      if (resp.status === 429)
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      if (resp.status === 402)
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("battle fn error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
