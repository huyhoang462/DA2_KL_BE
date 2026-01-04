import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEventById } from '../../services/eventService';
import {
  getTicketTypesByShowId,
  getTicketsByShowId,
} from '../../services/ticketService';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ErrorDisplay from '../../components/ui/ErrorDisplay';
import OrgCheckInSkeleton from '../../components/ui/OrgCheckInSkeleton';
import { Ticket, Users, ChevronDown } from 'lucide-react';

const OrgCheckInPage = () => {
  const { id: eventId } = useParams();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' or 'checkin'
  const [selectedShowId, setSelectedShowId] = useState(null);

  // Fetch event data
  const {
    data: event,
    isLoading: isLoadingEvent,
    error: eventError,
  } = useQuery({
    queryKey: ['eventDetail', eventId],
    queryFn: () => getEventById(eventId),
    enabled: !!eventId,
  });

  // Set default show when event loads
  React.useEffect(() => {
    if (event?.shows?.[0]) {
      setSelectedShowId(event.shows[0]._id || event.shows[0].id);
    }
  }, [event]);

  // Fetch ticket types statistics
  const {
    data: ticketStats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useQuery({
    queryKey: ['ticketStats', selectedShowId],
    queryFn: () => getTicketTypesByShowId(selectedShowId),
    enabled: !!selectedShowId,
  });

  // Fetch tickets list
  const {
    data: ticketsData,
    isLoading: isLoadingTickets,
    error: ticketsError,
  } = useQuery({
    queryKey: ['tickets', selectedShowId],
    queryFn: () => getTicketsByShowId(selectedShowId),
    enabled: !!selectedShowId && activeTab === 'checkin',
  });

  const selectedShow = useMemo(() => {
    if (!event?.shows || !selectedShowId) return null;
    return event.shows.find((show) => (show._id || show.id) === selectedShowId);
  }, [event, selectedShowId]);

  if (isLoadingEvent) {
    return <OrgCheckInSkeleton />;
  }

  if (eventError) {
    return <ErrorDisplay message={eventError.message} />;
  }

  if (!event) {
    return <ErrorDisplay message="Không tìm thấy sự kiện" />;
  }

  const handleShowChange = (e) => {
    setSelectedShowId(e.target.value);
  };

  const checkedInCount = ticketStats?.totalCheckedIn || 0;
  const totalSold = ticketStats?.totalSold || 0;
  const checkinPercentage =
    totalSold > 0 ? Math.round((checkedInCount / totalSold) * 100) : 0;

  return (
    <div className="">
      {/* Header with Show Selector */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-text-primary text-2xl font-bold">
            Quản lý Check-in
          </h1>
          <p className="text-text-secondary mt-1 text-sm">{event.name}</p>
        </div>

        {/* Show Selector */}
        <div className="relative w-full sm:w-64">
          <select
            value={selectedShowId || ''}
            onChange={handleShowChange}
            className="border-border-default bg-background-secondary text-text-primary focus:border-primary focus:ring-primary/20 w-full appearance-none rounded-lg border px-4 py-2.5 pr-10 focus:ring-2 focus:outline-none"
          >
            {event.shows?.map((show) => (
              <option key={show._id || show.id} value={show._id || show.id}>
                {show.name} -{' '}
                {new Date(show.startTime).toLocaleDateString('vi-VN')}
              </option>
            ))}
          </select>
          <ChevronDown className="text-text-secondary pointer-events-none absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-border-default mb-6 flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`border-primary text-primary px-6 py-3 font-medium transition-colors ${
            activeTab === 'overview'
              ? 'border-b-2'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4" />
            Tổng quan
          </div>
        </button>
        <button
          onClick={() => setActiveTab('checkin')}
          className={`border-primary text-primary px-6 py-3 font-medium transition-colors ${
            activeTab === 'checkin'
              ? 'border-b-2'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Danh sách vé
          </div>
        </button>
      </div>

      {/* Content */}
      {isLoadingStats ? (
        <OrgCheckInSkeleton />
      ) : statsError ? (
        <ErrorDisplay message={statsError.message} />
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Check-in Progress Card */}
              <div className="bg-background-secondary border-border-default rounded-lg border p-6 shadow-sm">
                <h2 className="text-text-primary mb-6 text-xl font-bold">
                  Tiến độ Check-in
                </h2>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Donut Chart */}
                  <div className="flex items-center justify-center">
                    <div className="relative h-48 w-48">
                      <svg className="h-full w-full -rotate-90 transform">
                        {/* Background circle */}
                        <circle
                          cx="96"
                          cy="96"
                          r="80"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="24"
                          className="text-gray-200"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="96"
                          cy="96"
                          r="80"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="24"
                          strokeDasharray={`${checkinPercentage * 5.024} 502.4`}
                          className="text-primary transition-all duration-500"
                        />
                      </svg>
                      {/* Center text */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-text-primary text-3xl font-bold">
                            {checkinPercentage}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary h-3 w-3 rounded-full"></div>
                      <div>
                        <p className="text-text-secondary text-sm">
                          Đã Check-in
                        </p>
                        <p className="text-text-primary text-2xl font-bold">
                          {checkedInCount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-gray-300"></div>
                      <div>
                        <p className="text-text-secondary text-sm">Chưa đến</p>
                        <p className="text-text-primary text-2xl font-bold">
                          {(totalSold - checkedInCount).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-border-default text-text-primary mt-6 flex items-center justify-center gap-x-2 border-t pt-4 text-center">
                  <p className="text-sm">Tổng vé bán: </p>{' '}
                  <p className="text-2xl font-bold">
                    {totalSold.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Ticket Types Details Card */}
              <div className="bg-background-secondary border-border-default rounded-lg border p-6 shadow-sm">
                <h2 className="text-text-primary mb-6 text-xl font-bold">
                  Chi tiết vé bán
                </h2>

                <div className="space-y-4">
                  {ticketStats?.ticketTypes?.map((ticket) => {
                    const soldPercentage =
                      ticket.quantityTotal > 0
                        ? (ticket.quantitySold / ticket.quantityTotal) * 100
                        : 0;

                    return (
                      <div key={ticket.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-text-primary font-semibold">
                              {ticket.name}
                            </p>
                            <p className="text-text-secondary text-sm">
                              {ticket.price.toLocaleString()}đ
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-text-primary font-bold">
                              {ticket.quantitySold} / {ticket.quantityTotal}
                            </p>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="bg-background-primary h-2 overflow-hidden rounded-full">
                          <div
                            className="bg-primary h-full transition-all duration-300"
                            style={{ width: `${soldPercentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'checkin' && (
            <div className="bg-background-secondary border-border-default rounded-lg border shadow-sm">
              <div className="p-6">
                <h2 className="text-text-primary mb-4 text-xl font-bold">
                  Danh sách vé
                </h2>

                {isLoadingTickets ? (
                  <div className="flex h-32 items-center justify-center">
                    <LoadingSpinner />
                  </div>
                ) : ticketsError ? (
                  <ErrorDisplay message={ticketsError.message} />
                ) : !ticketsData?.data || ticketsData.data.length === 0 ? (
                  <div className="text-text-secondary py-12 text-center">
                    <Ticket className="mx-auto mb-2 h-12 w-12 opacity-50" />
                    <p>Chưa có vé nào được mua</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-border-default text-text-secondary border-b text-left text-sm">
                          <th className="pb-3 font-medium">Mã QR</th>
                          <th className="pb-3 font-medium">Loại vé</th>
                          <th className="pb-3 font-medium">Người mua</th>
                          <th className="pb-3 font-medium">Email</th>
                          <th className="pb-3 font-medium">SĐT</th>
                          <th className="pb-3 font-medium">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-border-default divide-y">
                        {ticketsData.data.map((ticket) => (
                          <tr
                            key={ticket.id}
                            className="text-text-primary text-sm"
                          >
                            <td className="py-3 font-mono text-xs">
                              {ticket.qrCode}
                            </td>
                            <td className="py-3">
                              <div>
                                <p className="font-medium">
                                  {ticket.ticketType.name}
                                </p>
                                <p className="text-text-secondary text-xs">
                                  {ticket.ticketType.price.toLocaleString()}đ
                                </p>
                              </div>
                            </td>
                            <td className="py-3">{ticket.owner.fullName}</td>
                            <td className="py-3">{ticket.owner.email}</td>
                            <td className="py-3">{ticket.owner.phone}</td>
                            <td className="py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                                  ticket.status === 'checked_in'
                                    ? 'bg-green-100 text-green-800'
                                    : ticket.status === 'pending'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {ticket.status === 'checked_in'
                                  ? 'Đã check-in'
                                  : ticket.status === 'pending'
                                    ? 'Chờ check-in'
                                    : 'Đã hủy'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Pagination info */}
                    {ticketsData.pagination && (
                      <div className="text-text-secondary mt-4 text-center text-sm">
                        Trang {ticketsData.pagination.page} /{' '}
                        {ticketsData.pagination.totalPages} • Tổng{' '}
                        {ticketsData.pagination.total} vé
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OrgCheckInPage;
