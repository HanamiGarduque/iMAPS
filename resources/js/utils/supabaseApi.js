import axios from 'axios';

export const fetchParcelInspection = async (inspectionId) => {
    if (!inspectionId) return null;

    try {
        const { data } = await axios.get(
            `/api/inspections/${encodeURIComponent(inspectionId)}/supabase-data`,
            {
                withCredentials: true,
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            },
        );

        return data;
    } catch (error) {
        const status = error.response?.status;
        const message = status === 403
            ? 'You are not authorized to view this inspection evidence.'
            : 'Inspection evidence is temporarily unavailable.';
        const requestError = new Error(message);
        requestError.status = status;
        throw requestError;
    }
};