// resources/js/Pages/Parcels/Show.jsx
import React from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout'; // Assuming you use Laravel Breeze/Jetstream
import { Head } from '@inertiajs/react';
import ParcelInspectionStatus from '@/Components/ParcelInspectionStatus';

export default function Show({ auth, parcel }) {
    return (
        <AuthenticatedLayout
            user={auth.user}
            header={<h2 className="font-semibold text-xl text-gray-800 leading-tight">Parcel: {parcel.parcel_code}</h2>}
        >
            <Head title={`Parcel ${parcel.parcel_code}`} />

            <div className="py-12">
                <div className="max-w-7xl mx-auto sm:px-6 lg:px-8 space-y-6">
                    
                    {/* Existing Parcel Details Component would go here */}
                    <div className="p-4 sm:p-8 bg-white shadow sm:rounded-lg">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Parcel Information</h3>
                        <p>PIN: {parcel.property_index_number}</p>
                        {/* ... */}
                    </div>

                    {/* NEW: Drop the inspection component here and pass the UUID */}
                    <ParcelInspectionStatus parcelId={parcel.supabase_parcel_id} />
                    
                </div>
            </div>
        </AuthenticatedLayout>
    );
}