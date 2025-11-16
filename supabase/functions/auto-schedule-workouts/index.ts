import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Starting auto-schedule workouts...");

    // Obtenir la date d'aujourd'hui et les 7 prochains jours
    const today = new Date();
    const daysToSchedule: Date[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      daysToSchedule.push(date);
    }

    console.log(`Scheduling for ${daysToSchedule.length} days`);

    // Obtenir tous les plans avec des jours récurrents
    const { data: templates, error: templatesError } = await supabase
      .from('workout_templates')
      .select('*')
      .not('recurring_days', 'eq', '[]');

    if (templatesError) {
      console.error("Error fetching templates:", templatesError);
      throw templatesError;
    }

    console.log(`Found ${templates?.length || 0} templates with recurring days`);

    let createdCount = 0;
    let skippedCount = 0;

    // Pour chaque plan avec des jours récurrents
    for (const template of templates || []) {
      const recurringDays = Array.isArray(template.recurring_days) 
        ? template.recurring_days.filter((d: any): d is number => typeof d === 'number')
        : [];

      if (recurringDays.length === 0) continue;

      // Pour chaque jour à planifier
      for (const date of daysToSchedule) {
        // Obtenir le jour de la semaine (1 = Lundi, 7 = Dimanche)
        const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();

        // Si ce jour est dans les jours récurrents du plan
        if (recurringDays.includes(dayOfWeek)) {
          const dateStr = date.toISOString().split('T')[0];

          // Vérifier si une séance est déjà planifiée pour ce jour et ce plan
          const { data: existing } = await supabase
            .from('planned_workouts')
            .select('id')
            .eq('user_id', template.user_id)
            .eq('workout_template_id', template.id)
            .eq('date', dateStr)
            .maybeSingle();

          if (existing) {
            console.log(`Already scheduled: ${template.name} on ${dateStr}`);
            skippedCount++;
            continue;
          }

          // Trouver le slot disponible pour ce jour
          const { data: dayWorkouts } = await supabase
            .from('planned_workouts')
            .select('slot')
            .eq('user_id', template.user_id)
            .eq('date', dateStr)
            .order('slot', { ascending: false })
            .limit(1);

          const nextSlot = dayWorkouts && dayWorkouts.length > 0 
            ? dayWorkouts[0].slot + 1 
            : 1;

          // Créer la séance planifiée
          const { error: insertError } = await supabase
            .from('planned_workouts')
            .insert({
              user_id: template.user_id,
              workout_template_id: template.id,
              date: dateStr,
              slot: nextSlot,
              status: 'planned'
            });

          if (insertError) {
            console.error(`Error creating planned workout for ${template.name} on ${dateStr}:`, insertError);
          } else {
            console.log(`Created: ${template.name} on ${dateStr} (slot ${nextSlot})`);
            createdCount++;
          }
        }
      }
    }

    console.log(`Completed: ${createdCount} created, ${skippedCount} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        created: createdCount,
        skipped: skippedCount,
        message: `Auto-scheduling completed: ${createdCount} workouts created, ${skippedCount} skipped`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error("Error in auto-schedule-workouts:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
