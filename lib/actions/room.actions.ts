'use server';

import { nanoid } from 'nanoid'
import { liveblocks } from '../liveblocks';
import { revalidatePath } from 'next/cache';
import { getAccessType, parseStringify } from '../utils';
import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';

const getCurrentUserEmail = async () => {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    return null;
  }

  return clerkUser.emailAddresses[0]?.emailAddress ?? null;
};

export const createDocument = async ({ userId, email }: CreateDocumentParams) => {
  const roomId = nanoid();

  try {
    const currentEmail = await getCurrentUserEmail();

    if (!currentEmail || currentEmail !== email) {
      throw new Error('Unauthorized to create document');
    }

    const metadata = {
      creatorId: userId,
      email,
      title: 'Untitled'
    }

    const usersAccesses: RoomAccesses = {
      [email]: ['room:write']
    }

    const room = await liveblocks.createRoom(roomId, {
      metadata,
      usersAccesses,
      defaultAccesses: []
    });
    
    revalidatePath('/');

    return parseStringify(room);
  } catch (error) {
    console.log(`Error happened while creating a room: ${error}`);
  }
}

export const getDocument = async ({ roomId, userId }: { roomId: string; userId: string }) => {
  try {
      const currentEmail = await getCurrentUserEmail();

      if (!currentEmail || currentEmail !== userId) {
        throw new Error('Unauthorized to access this document');
      }

      const room = await liveblocks.getRoom(roomId);
    
      const hasAccess = Object.keys(room.usersAccesses).includes(userId);
    
      if(!hasAccess) {
        throw new Error('You do not have access to this document');
      }
    
      return parseStringify(room);
  } catch (error) {
    console.log(`Error happened while getting a room: ${error}`);
  }
}

export const updateDocument = async (roomId: string, title: string) => {
  try {
    const currentEmail = await getCurrentUserEmail();

    if (!currentEmail) {
      throw new Error('Unauthorized to update document');
    }

    const room = await liveblocks.getRoom(roomId);
    const access = room.usersAccesses[currentEmail] ?? [];

    if (!access.includes('room:write')) {
      throw new Error('Insufficient permissions to update document');
    }

    const updatedRoom = await liveblocks.updateRoom(roomId, {
      metadata: {
        title
      }
    })

    revalidatePath(`/documents/${roomId}`);

    return parseStringify(updatedRoom);
  } catch (error) {
    console.log(`Error happened while updating a room: ${error}`);
  }
}

export const getDocuments = async (email: string ) => {
  try {
      const currentEmail = await getCurrentUserEmail();

      if (!currentEmail || currentEmail !== email) {
        throw new Error('Unauthorized to list documents');
      }

      const rooms = await liveblocks.getRooms({ userId: email });
    
      return parseStringify(rooms);
  } catch (error) {
    console.log(`Error happened while getting rooms: ${error}`);
  }
}

export const updateDocumentAccess = async ({ roomId, email, userType, updatedBy }: ShareDocumentParams) => {
  try {
    const currentEmail = await getCurrentUserEmail();

    if (!currentEmail) {
      throw new Error('Unauthorized to update document access');
    }

    const room = await liveblocks.getRoom(roomId);
    const access = room.usersAccesses[currentEmail] ?? [];

    if (!access.includes('room:write')) {
      throw new Error('Insufficient permissions to update document access');
    }

    const usersAccesses: RoomAccesses = {
      [email]: getAccessType(userType) as AccessType,
    }

    const updatedRoom = await liveblocks.updateRoom(roomId, { 
      usersAccesses
    })

    if(updatedRoom) {
      const notificationId = nanoid();

      await liveblocks.triggerInboxNotification({
        userId: email,
        kind: '$documentAccess',
        subjectId: notificationId,
        activityData: {
          userType,
          title: `You have been granted ${userType} access to the document by ${updatedBy.name}`,
          updatedBy: updatedBy.name,
          avatar: updatedBy.avatar,
          email: updatedBy.email
        },
        roomId
      })
    }

    revalidatePath(`/documents/${roomId}`);
    return parseStringify(updatedRoom);
  } catch (error) {
    console.log(`Error happened while updating a room access: ${error}`);
  }
}

export const removeCollaborator = async ({ roomId, email }: {roomId: string, email: string}) => {
  try {
    const currentEmail = await getCurrentUserEmail();

    if (!currentEmail) {
      throw new Error('Unauthorized to remove collaborator');
    }

    const room = await liveblocks.getRoom(roomId)
    const access = room.usersAccesses[currentEmail] ?? [];

    if (!access.includes('room:write')) {
      throw new Error('Insufficient permissions to remove collaborator');
    }

    if(room.metadata.email === email) {
      throw new Error('You cannot remove yourself from the document');
    }

    const updatedRoom = await liveblocks.updateRoom(roomId, {
      usersAccesses: {
        [email]: null
      }
    })

    revalidatePath(`/documents/${roomId}`);
    return parseStringify(updatedRoom);
  } catch (error) {
    console.log(`Error happened while removing a collaborator: ${error}`);
  }
}

export const deleteDocument = async (roomId: string) => {
  try {
    const currentEmail = await getCurrentUserEmail();

    if (!currentEmail) {
      throw new Error('Unauthorized to delete document');
    }

    const room = await liveblocks.getRoom(roomId);
    const access = room.usersAccesses[currentEmail] ?? [];

    if (!access.includes('room:write')) {
      throw new Error('Insufficient permissions to delete document');
    }

    await liveblocks.deleteRoom(roomId);
    revalidatePath('/');
    redirect('/');
  } catch (error) {
    console.log(`Error happened while deleting a room: ${error}`);
  }
}
