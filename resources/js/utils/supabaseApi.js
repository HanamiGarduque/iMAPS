// resources/js/utils/supabaseApi.js
import { supabase } from './supabaseClient';

export const fetchParcelInspection = async (inspectionId) => {
    if (!inspectionId) return null; 

    try {
        const { data, error } = await supabase
            .from('field_jobs')
            .select(`
                id,
                local_inspection_id,
                status,
                scheduled_date,
                deadline_date,
                submitted_at,
                
                inspection_result,
                is_compliant,
                findings,
                observations,
                discrepancies,
                recommendations,
                inspector_notes,
                remarks,
                
                checklist_completed_count,
                checklist_total_count,
                checklist_data,
                
                photo_count,
                photo_paths,
                
                supabase_parcels (parcel_code, property_index_number),
                supabase_zoning_applications (reference_number, applicant_name),
                
                field_job_photos (
                    id, 
                    photo_url, 
                    latitude, 
                    longitude, 
                    captured_at
                )
            `)
            .eq('local_inspection_id', inspectionId)
            .maybeSingle(); 

        if (error) throw error;
        return data;

    } catch (error) {
        console.error("Supabase Error fetching inspection:", error.message);
        return null;
    }
};