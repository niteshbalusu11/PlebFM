import { MongoError } from 'mongodb';
import { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../middleware/mongodb';
import Hosts, { Host } from '../../../models/Host';
import Plays, { Play } from '../../../models/Play';
/**
 * POST /api/leaderboard/queue
 * Query - Optional: ?next=<undefined | "" | true | false>
 * Query - Optional: limit=11+, default=10
 * @param req
 * @param res
 * @returns HTTP Status Code <404 | 500 | 200>
 *          JSON { success: <true | false>, message: <'Error message' | sortedPlays> }
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (req.method !== 'GET') {
      return res.status(404).json({
        success: false,
        message: 'Invalid request method!',
      });
    }
    const { hostShortName, limit, next } = req.query;
    if (!hostShortName) {
      return res.status(404).json({
        success: false,
        message: 'Expected query param hostShortName!',
      });
    }
    // Lookup host by shortname
    const host: Host = await Hosts.findOne({
      shortName: hostShortName,
    }).catch(e => {
      console.error(e);
      throw new Error(e);
    });
    // If not host exists, return error
    if (!host)
      return res.status(404).json({
        success: false,
        message: `No host for given host shortName ${hostShortName}!`,
      });
    // Query Plays: Get play objs where hostId = host.hostId & status = queued
    // sort by highest runningTotal and oldest queueTimestamp if ties occur
    let sortedPlays: Array<Play> = await Plays.find(
      {
        filter: {
          hostId: host.hostId,
          status: 'queued',
        },
      },
      { options: { limit: limit ?? 10 } },
    )
      .sort({ runningTotal: -1, queueTimestamp: 1 })
      .catch(e => {
        console.error(e);
        throw new Error(e);
      });
    // Plays.find returns a list of results. If no results found, list will be empty []
    // Check for response emptiness. Return error if plays is empty list
    if (sortedPlays.length === 0)
      return res.status(404).json({
        success: false,
        message: `No queued Plays exist for host ${hostShortName} / hostId ${host.hostId}!`,
      });
    // Use "next=true" query param to toggle updating the queue
    if (next === 'true') {
      // Grab first play obj in queue => play obj w/ highest runningTotal and oldest timestamp
      const winner = sortedPlays[0];
      // Query Plays: Get leading play object from db and update status to "next"
      // Since playId is a globally unique cuid, should return 1 play obj
      const play: Play = await Plays.findOneAndUpdate(
        { playId: winner.playId },
        { $set: { status: 'next' } },
      ).catch(e => {
        console.error(e);
        throw new MongoError(e);
      });
      // If nothing returned, then nothing was updated and thus nothing was found, return error
      if (!play)
        return res.status(404).json({
          success: false,
          message: `No Play found for playId ${winner.playId} & host ${hostShortName}!`,
        });
      // Query Plays: Get all Play objects where hostId = host.hostId
      // Include all statuses, sort by highest runningTotal and oldest queueTimestamp if ties occur
      sortedPlays = await Plays.find(
        { hostId: host.hostId },
        { options: { limit: limit ?? 10 } },
      )
        .sort({ runningTotal: -1, queueTimestamp: 1 })
        .catch(e => {
          console.error(e);
          throw new MongoError(e);
        });
      // If no Plays exist with that hostId, somethings wrong, return error
      if (sortedPlays.length === 0)
        return res.status(404).json({
          success: false,
          message: `No Plays found for host ${hostShortName}, hostId ${host.hostId}!`,
        });
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export default connectDB(handler);
